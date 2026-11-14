"""Minecraft 地址查询与状态接口备选：隔离浏览器数据、固定上游，不访问线上同步。"""
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
BROWSER = os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome')
Path('artifacts').mkdir(exist_ok=True)
errors, queries, sources, pending, canceled = [], [], [], [], []

def check(condition, message):
    print(('PASS ' if condition else 'FAIL ') + message, flush=True)
    if not condition:
        errors.append(message)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=BROWSER, headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='zh-CN', timezone_id='Asia/Shanghai')
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('requestfailed', lambda r: canceled.append(r.url))
    context.route('https://v1.hitokoto.cn/**', lambda r: r.fulfill(json={'id': 1, 'hitokoto': '测试'}))

    def status_route(route):
        mode = urlparse(route.request.url).path.split('/')[-1]
        sources.append(mode)
        if mode == 'pending':
            pending.append(route)
            return
        if mode == 'broken':
            route.fulfill(status=503, json={})
            return
        reading = {'online': mode != 'offline', 'playersOnline': 0, 'playersMax': 30, 'version': '1.21.1'}
        value = reading if mode == 'standalone' else {'minecraft': reading}
        if mode == 'missing':
            value = {'overall': 'operational', 'services': [], 'refreshAfterMs': 120000}
        route.fulfill(json=value)

    def query_route(route):
        queries.append(route.request.url)
        if 'fail.example.com' in route.request.url:
            route.fulfill(status=503, json={})
        elif 'invalid.example.com' in route.request.url:
            route.fulfill(json={'error': 'unavailable'})
        else:
            bedrock = '/bedrock/' in route.request.url
            route.fulfill(json={'online': True, 'version': 'Bedrock 1.21' if bedrock else {'name_clean': 'Java 1.21'}, 'players': {'online': 3, 'max': 40}, 'motd': {'raw': '§a备用服务器'}})

    context.route('https://status.example.com/**', status_route)
    context.route('https://api.mcstatus.io/**', query_route)
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_selector('.m-grid .m-tile')
    page.wait_for_timeout(400)
    seed = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    mc = page.locator('.m-minecraft')

    def load(mode, kind='youzai', address=None, fallback='java'):
        server = {'kind': kind, 'address': address or f'{mode}.example.com', 'name': '备选测试', 'sourceUrl': f'https://status.example.com/{mode}', 'historyUrl': '', 'fallbackKind': fallback}
        seed['items']['mc-test'] = {'id': 'mc-test', 'type': 'widget', 'kind': 'minecraft', 'size': '4x4', 'config': {'route': 'direct', 'servers': [server]}}
        seed['groups'][0]['items'] = ['mc-test']
        page.evaluate('d => {localStorage.setItem("myriad.data", JSON.stringify(d)); const l=JSON.parse(localStorage.getItem("myriad.local")); l.activeGroup=d.groups[0].id; localStorage.setItem("myriad.local", JSON.stringify(l));}', seed)
        page.reload()
        expect(mc).to_be_visible()

    load('address-java', kind='java', address='mc.example.com:25566')
    expect(mc.locator('.m-minecraft__online')).to_contain_text('3 / 40')
    check(not sources and '/java/mc.example.com%3A25566' in queries[-1], 'Java 只填地址即可查询，无需完整状态接口')
    check(mc.locator('.m-history-chart').count() == 0, '未提供历史时不显示人数曲线')
    mc.get_by_role('button', name='组件设置').click()
    expect(page.get_by_text('没有状态接口？选择 Java 版或基岩版，只需填写服务器地址，无需 Key。', exact=True)).to_be_visible()
    page.get_by_role('combobox', name='服务器类型').select_option('bedrock')
    page.get_by_label('服务器地址', exact=True).fill('bedrock.example.com:19133')
    page.get_by_role('button', name='保存', exact=True).click()
    expect(mc.locator('.m-minecraft__meta')).to_contain_text('Bedrock 1.21')
    check('/bedrock/bedrock.example.com%3A19133' in queries[-1], '基岩版仅地址查询，保留字符串版本信息')

    for mode in ['standalone', 'wrapped', 'offline']:
        before = len(queries)
        load(mode)
        expect(mc.locator('.m-minecraft__online')).to_contain_text('0 / 30')
        check(len(queries) == before, f'{mode} 状态 JSON 不要求 services / overall，明确离线不触发备选')
        if mode == 'offline':
            check(mc.locator('.is-outage').count() == 1, '主接口明确离线保持离线')

    for mode in ['missing', 'broken']:
        load(mode)
        expect(mc.locator('.m-minecraft__online')).to_contain_text('3 / 40')
        expect(mc.locator('footer')).to_contain_text('已按地址查询')
        check(f'/java/{mode}.example.com' in queries[-1], f'{mode} 缺少 Minecraft 或接口失败时按地址自动备选')
    before = len(queries)
    page.reload()
    expect(mc.locator('.m-minecraft__online')).to_contain_text('3 / 40')
    check(len(queries) == before, '页面刷新复用备选查询缓存')

    mc.get_by_role('button', name='组件设置').click()
    page.get_by_role('combobox', name='状态接口不可用时').select_option('bedrock')
    page.get_by_label('服务器地址', exact=True).fill('fallback-bedrock.example.com:19132')
    page.get_by_role('button', name='保存', exact=True).click()
    expect(mc.locator('.m-minecraft__meta')).to_contain_text('Bedrock 1.21')
    check('/bedrock/fallback-bedrock.example.com%3A19132' in queries[-1], '备选查询可配置为基岩版，修改后不复用旧 Java 缓存')
    page.screenshot(path='artifacts/minecraft-fallback.png', full_page=True)

    mc.get_by_role('button', name='组件设置').click()
    page.get_by_label('服务器地址', exact=True).fill('')
    page.get_by_role('button', name='保存', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('请填写有效的服务器地址')
    check(True, '启用备选时必须填写有效地址')
    before = len(queries)
    page.get_by_role('combobox', name='状态接口不可用时').select_option('none')
    page.get_by_role('button', name='保存', exact=True).click()
    expect(mc).to_contain_text('暂时无法查询服务器状态')
    check(len(queries) == before, '关闭备选后可留空地址，接口失败不再查询')

    for address in ['fail.example.com', 'invalid.example.com']:
        load('broken', address=address)
        expect(mc).to_contain_text('暂时无法查询服务器状态')
        check(mc.locator('.m-minecraft__online').count() == 0, f'{address} 全部查询失败或无效响应显示无法查询，不误报离线')

    load('pending')
    page.wait_for_timeout(300)
    check(len(pending) == 1, '主状态请求正在加载')
    before = len(queries)
    page.evaluate("() => {Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}); document.dispatchEvent(new Event('visibilitychange'));}")
    page.wait_for_timeout(200)
    check(any('status.example.com/pending' in url for url in canceled) and len(queries) == before, '切后台取消主请求，并且不启动备用查询')
    for route in pending:
        try:
            route.abort()
        except Exception:
            pass
    browser.close()

if errors:
    raise SystemExit('\n'.join(errors))
print('ALL OK')
