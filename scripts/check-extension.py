"""万象扩展加载测试：在独立 Chrome 配置中加载 .output/chrome-mv3。

通过 CDP Extensions.loadUnpacked 加载，不依赖品牌版 Chrome 已移除的
--load-extension 参数。MYRIAD_BROWSER 可指定支持该调试接口的 Chromium。
截图存到 artifacts/。
"""
import os, sys, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, 'apps/extension/.output/chrome-mv3')
BROWSER = os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome')
errors = []

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: errors.append(msg)

with sync_playwright() as p, tempfile.TemporaryDirectory() as profile:
    ctx = p.chromium.launch_persistent_context(
        profile,
        headless=True,
        executable_path=BROWSER,
        locale='zh-CN',
        timezone_id='Asia/Shanghai',
        viewport={'width': 1440, 'height': 900},
        ignore_default_args=['--disable-extensions'],
        args=['--enable-unsafe-extension-debugging'],
    )
    cdp = ctx.browser.new_browser_cdp_session()
    loaded = cdp.send('Extensions.loadUnpacked', {'path': EXT})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker', timeout=15000)
    ext_id = sw.url.split('/')[2]
    check(ext_id == loaded['id'], f'扩展已加载（{ext_id}）')

    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'console: {m.text}'))
    page.goto(f'chrome-extension://{ext_id}/newtab.html')
    page.wait_for_selector('.m-onb__option', timeout=15000)
    check(page.locator('.m-onb__option').count() == 3, '扩展版引导含书签导入选项')
    page.locator('.m-onb__option', has_text='默认').first.click()
    page.wait_for_selector('.m-grid .m-tile', timeout=10000)
    page.wait_for_timeout(1200)
    check(page.locator('.m-groups__tab').count() == 4, '默认预设 4 个分组')
    check(page.title() != '', f'页面标题：{page.title()}')
    style = page.locator('.myriad').evaluate("""el => {
        const root = getComputedStyle(el);
        const grid = getComputedStyle(el.querySelector('.m-grid'));
        const button = getComputedStyle(el.querySelector('.m-toolbar button'));
        return {bg:root.getPropertyValue('--bg').trim(),text:root.getPropertyValue('--text').trim(),
                font:root.fontSize,grid:grid.display,radius:button.borderRadius};
    }""")
    check(bool(style['bg']) and bool(style['text']) and style['font'] == '14px', '实际扩展页面加载主题与基础样式')
    check(style['grid'] == 'grid' and float(style['radius'].removesuffix('px')) > 0, '实际扩展网格与按钮样式生效')
    page.screenshot(path=os.path.join(ROOT, 'artifacts/extension-newtab.png'))

    # chrome.storage 持久化：刷新后仍跳过引导
    page.reload(); page.wait_for_timeout(1500)
    check(page.locator('.m-onb__option').count() == 0 and page.locator('.m-grid .m-tile').count() > 0, 'chrome.storage 持久化')
    ctx.close()

print('\n'.join(errors) if errors else 'ALL OK')
sys.exit(1 if errors else 0)
