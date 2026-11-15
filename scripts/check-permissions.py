"""Exercise origin permissions in a real isolated extension, with deterministic grant/deny responses."""
import json
import os
from pathlib import Path
import sys
import tempfile
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'apps/extension/.output/chrome-mv3'
errors = []

def check(condition, message):
    print(('PASS ' if condition else 'FAIL ') + message)
    if not condition:
        errors.append(message)

with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
    context = p.chromium.launch_persistent_context(
        profile, executable_path=os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome'),
        headless=True, locale='zh-CN', timezone_id='Asia/Shanghai',
        ignore_default_args=['--disable-extensions'], args=['--enable-unsafe-extension-debugging'],
    )
    cdp = context.browser.new_browser_cdp_session()
    ext_id = cdp.send('Extensions.loadUnpacked', {'path': str(EXT)})['id']
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    # Only override contains/request. getAll still checks Chrome's actual installed grants.
    page.add_init_script("""
        window.permissionTest = {allowed: new Set(), prompts: [], nextGrant: false};
        const nativeContains = chrome.permissions.contains.bind(chrome.permissions);
        chrome.permissions.contains = async (request) => request.origins
            ? request.origins.every(o => window.permissionTest.allowed.has(o))
            : nativeContains(request);
        chrome.permissions.request = async ({origins}) => {
            const test = window.permissionTest;
            test.prompts.push({origins, gesture:navigator.userActivation.isActive});
            if (test.nextGrant) origins.forEach(o => test.allowed.add(o));
            return test.nextGrant;
        };
    """)
    requests = []
    def network(route):
        url = route.request.url
        if '/complete/search' in url:
            requests.append(url)
            route.fulfill(json=['GitHub', ['GitHub remote suggestion']])
        elif '/HPImageArchive.aspx' in url:
            requests.append(url)
            route.fulfill(json={'images': [{'url': '/permission-test.png'}]})
        else:
            route.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>')
    context.route('https://**/*', network)
    page.goto(f'chrome-extension://{ext_id}/newtab.html')
    page.locator('.m-onb__option', has_text='默认').first.click()
    page.wait_for_selector('.m-grid .m-tile')
    page.wait_for_timeout(500)
    installed = page.evaluate('chrome.permissions.getAll()')
    check(not installed.get('origins'), '实际新安装扩展没有预授予主机权限')
    field = page.locator('.m-search__input')
    field.fill('GitHub')
    page.wait_for_timeout(400)
    check(not requests, '未授权时不发送搜索输入到远程联想接口')
    check(page.locator('.m-search__sug', has_text='GitHub').count() > 0, '未授权时保留本地快捷方式匹配')
    permission = page.get_by_role('button', name='允许 Google 搜索联想')
    permission.click()
    page.wait_for_timeout(250)
    check(permission.count() == 1 and not requests, '拒绝授权后继续显示重试入口且不请求远程')
    page.evaluate('window.permissionTest.nextGrant = true')
    permission.click()
    page.wait_for_timeout(400)
    check(any('/complete/search' in url for url in requests), '授权成功后加载当前引擎远程建议')
    prompts = page.evaluate('window.permissionTest.prompts')
    check(all(p['gesture'] for p in prompts), '权限请求保留原始点击的用户手势')
    check(all(p['origins'] == ['https://suggestqueries.google.com/*'] for p in prompts), '搜索授权只请求当前联想接口来源')
    count = len(requests)
    field.press('Tab')
    page.wait_for_timeout(300)
    check(len(requests) == count and page.locator('.m-search button[title^="允许"]').count() == 1, '切换引擎不复用其他来源的权限')
    page.locator('.m-toolbar button').last.click()
    page.get_by_role('button', name='背景', exact=True).click()
    page.get_by_role('radio', name='壁纸', exact=True).click()
    current = page.locator('.m-wall.is-current')
    current.locator('select').select_option('bing')
    page.wait_for_timeout(300)
    check(not any('/HPImageArchive.aspx' in url for url in requests), '选择 Bing 壁纸不会自动抓取或弹权限')
    page.evaluate('window.permissionTest.nextGrant = false')
    current.get_by_role('button', name='允许 Bing 每日壁纸').click()
    page.wait_for_timeout(200)
    check(current.get_by_role('button', name='允许 Bing 每日壁纸').count() == 1, 'Bing 拒绝后可重新授权')
    page.evaluate('window.permissionTest.nextGrant = true')
    current.get_by_role('button', name='允许 Bing 每日壁纸').click()
    page.wait_for_timeout(400)
    check(any('/HPImageArchive.aspx' in url for url in requests), 'Bing 授权成功立即刷新当前组合壁纸')
    prompts = page.evaluate('window.permissionTest.prompts')
    check(prompts[-1]['origins'] == ['https://www.bing.com/*'] and prompts[-1]['gesture'], 'Bing 在点击内只请求它自己的来源')
    context.close()

print('\n'.join(errors) if errors else 'ALL OK')
sys.exit(1 if errors else 0)
