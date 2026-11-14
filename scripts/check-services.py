"""网站监控 / Minecraft / 汇率：固定数据测试，不触碰线上同步文档。"""
import os
import sys
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
BROWSER = os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome')
errors = []
counts = {'snapshot': 0, 'history': 0, 'minecraft': 0, 'frank': 0, 'er': 0, 'fawaz': 0}

def check(condition, message):
    print(('PASS ' if condition else 'FAIL ') + message, flush=True)
    if not condition:
        errors.append(message)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=BROWSER, headless=True)
    context = browser.new_context(viewport={'width': 1600, 'height': 1100}, locale='zh-CN', timezone_id='Asia/Shanghai', permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    page.clock.install()
    page.emulate_media(color_scheme='dark')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_selector('.m-grid .m-tile')
    page.wait_for_timeout(400)
    seed = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    widgets = [
        {'id': 'service-test', 'type': 'widget', 'kind': 'status', 'size': '2x4', 'config': {}},
        {'id': 'mc-test', 'type': 'widget', 'kind': 'minecraft', 'size': '4x4', 'config': {}},
        {'id': 'currency-test', 'type': 'widget', 'kind': 'currency', 'size': '4x2', 'config': {}},
    ]
    seed['items'].update({item['id']: item for item in widgets})
    seed['groups'][0]['items'] = [item['id'] for item in widgets]
    page.evaluate('data => { localStorage.setItem("myriad.data", JSON.stringify(data)); const local=JSON.parse(localStorage.getItem("myriad.local")); local.activeGroup=data.groups[0].id; localStorage.setItem("myriad.local", JSON.stringify(local)); }', seed)
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    services = [{'id': key, 'name': name, 'status': 'operational', 'latencyMs': latency} for key, name, latency in [('website', '官网', 100), ('api', 'API', 200), ('assets', '资源', 30), ('mail', '邮件', 70)]]
    minecraft = {'online': True, 'status': 'operational', 'address': 'play.mcyzw.top:25703', 'playersOnline': 0, 'playersMax': 20, 'version': '1.21', 'latencyMs': 60, 'motd': '§a欢迎 §lMinecraft <img src=x onerror=alert(1)>'}
    snapshot = {'generatedAt': now, 'refreshAfterMs': 3600000, 'overall': 'degraded', 'services': services, 'node': {'name': 'EQAD-003', 'status': 'operational', 'cpuUsage': 25, 'memoryUsage': 50}, 'minecraft': minecraft, 'history': [{'time': now - (23-i)*3600000, 'status': 'offline' if i < 2 else 'online'} for i in range(24)]}
    history = {'samples': [{'capturedAt': now-(23-i)*3600000, 'overall': 'operational', 'services': [{**service, 'latencyMs': service['latencyMs'] + i} for service in services], 'minecraft': {'playersOnline': None if i == 10 else i % 8}} for i in range(24)]}

    def status_route(route):
        is_history = urlparse(route.request.url).path.endswith('/history')
        counts['history' if is_history else 'snapshot'] += 1
        route.fulfill(json=history if is_history else snapshot, headers={'Access-Control-Allow-Origin': '*'})

    def minecraft_route(route):
        counts['minecraft'] += 1
        route.fulfill(json={'online': True, 'version': {'name_clean': '1.21.1'}, 'players': {'online': 3, 'max': 40, 'sample': []}, 'motd': {'raw': '§6自定义服务器'}}, headers={'Access-Control-Allow-Origin': '*'})

    def frank_route(route):
        counts['frank'] += 1
        route.fulfill(status=404, json={'error': 'unsupported'}, headers={'Access-Control-Allow-Origin': '*'})

    def er_route(route):
        counts['er'] += 1
        code = urlparse(route.request.url).path.split('/')[-1]
        if code == 'BTC':
            route.fulfill(status=404, json={}, headers={'Access-Control-Allow-Origin': '*'})
        else:
            route.fulfill(json={'rates': {'USD': .2, 'CNY': 5}, 'time_last_update_unix': now//1000}, headers={'Access-Control-Allow-Origin': '*'})

    def fawaz_route(route):
        counts['fawaz'] += 1
        url = route.request.url
        code = urlparse(url).path.rsplit('/', 1)[-1].split('.')[0]
        day = url.split('currency-api@')[-1].split('/')[0]
        if day == 'latest':
            day = datetime.now(timezone.utc).date().isoformat()
        route.fulfill(json={'date': day, code: {'usd': 1000 if code == 'btc' else .2, 'cny': 5}}, headers={'Access-Control-Allow-Origin': '*'})

    context.route('https://status.mcyzw.top/api/status**', status_route)
    context.route('https://api.mcstatus.io/**', minecraft_route)
    context.route('https://api.frankfurter.dev/**', frank_route)
    context.route('https://open.er-api.com/**', er_route)
    context.route('https://cdn.jsdelivr.net/npm/@fawazahmed0/**', fawaz_route)
    page.reload()
    page.wait_for_selector('.m-status__overall')
    page.wait_for_selector('.m-minecraft__online')
    page.wait_for_selector('.m-currency__result')
    page.wait_for_selector('.m-currency .m-history-chart polyline', state='attached')
    check(page.locator('.m-widget-head .m-eyebrow').count() == 0, '小组件不显示编号英文小标签')
    check(counts['snapshot'] == 1, '监控与 Minecraft 共用同一快照请求')
    check(page.locator('.m-status__services > div').count() == 4, '监控显示四个服务与延迟')
    check('91.7%' in page.locator('.m-status__availability').inner_text(), '24 小时样本可用率')
    check(page.locator('.m-status .m-history-chart').count() == 4, '各服务历史折线')
    check('0 / 20' in page.locator('.m-minecraft__online').inner_text(), '在线零人正确显示')
    check(page.locator('.m-minecraft__motd img').count() == 0, 'MOTD 的 HTML 作为文字渲染')
    check(page.locator('.m-minecraft__motd span').first.evaluate('el => getComputedStyle(el).color') == 'rgb(85, 255, 85)', 'MOTD 颜色解析')
    check(page.locator('.m-minecraft .m-history-chart').count() == 1, '悠哉世界已有历史显示人数走势')
    check(page.locator('.m-minecraft__actions').count() == 0, '默认没有服务器快捷操作')
    page.locator('.m-status').get_by_role('button', name='刷新状态', exact=True).click()
    page.wait_for_timeout(200)
    check(counts['snapshot'] == 1, '手动刷新遵守服务端 refreshAfterMs')
    check('ExchangeRate-API' in page.locator('.m-currency footer').inner_text(), '主来源失败后使用免费备用汇率')
    check(counts['er'] == 1, '历史请求不会使用今天的 ER 报价')
    check(counts['fawaz'] == 7, '备用来源按五天采样近三十天走势')
    page.get_by_role('spinbutton', name='CNY 金额').fill('100')
    check('20 USD' in page.locator('.m-currency__result').inner_text(), '金额换算')
    page.get_by_role('spinbutton', name='CNY 金额').fill('0')
    check('0 USD' in page.locator('.m-currency__result').inner_text(), '零金额正常显示')
    page.get_by_role('spinbutton', name='CNY 金额').fill('')
    check('—' in page.locator('.m-currency__result').inner_text(), '空金额不当成零')
    page.get_by_role('spinbutton', name='CNY 金额').fill('100')
    page.screenshot(path='artifacts/services-dark.png', full_page=True)
    page.locator('.m-currency').get_by_role('button', name='交换币种').click()
    page.wait_for_selector('input[aria-label="USD 金额"]')
    page.wait_for_timeout(300)
    check('500 CNY' in page.locator('.m-currency__result').inner_text(), '交换币种重新换算')

    # 无效币种不保存；第三来源支持可选的加密货币。
    page.locator('.m-currency').get_by_role('button', name='组件设置').click()
    page.get_by_label('基准币种', exact=True).fill('../bad')
    page.get_by_role('button', name='保存', exact=True).click()
    check(page.get_by_role('alert').count() >= 1, '无效币种阻止保存')
    page.get_by_label('基准币种', exact=True).fill('BTC')
    page.get_by_label('目标币种', exact=True).fill('USD')
    page.get_by_role('switch', name='显示常用加密货币').click()
    page.get_by_role('switch', name='显示汇率走势').click()
    page.get_by_role('button', name='保存', exact=True).click()
    page.wait_for_timeout(400)
    check('Currency API' in page.locator('.m-currency footer').inner_text(), '前两个来源失败后使用第三来源')
    check('BTC' in page.locator('.m-currency__pair').inner_text(), '加密货币为用户主动开启')

    # 改成自定义 Java 服务器，不沿用悠哉世界的历史。
    page.locator('.m-minecraft').get_by_role('button', name='组件设置').click()
    page.get_by_role('combobox', name='服务器类型').select_option('java')
    page.get_by_role('textbox', name='服务器地址', exact=True).fill('mc.example.com:25565')
    page.get_by_role('textbox', name='显示名称').fill('测试服务器')
    page.get_by_text('自定义快捷操作', exact=True).click()
    page.get_by_role('button', name='添加快捷操作').click()
    page.get_by_role('textbox', name='操作名称').fill('复制地址')
    page.get_by_role('combobox', name='自定义快捷操作').select_option('copy')
    page.get_by_role('button', name='保存', exact=True).click()
    page.wait_for_timeout(400)
    check(page.locator('.m-minecraft .m-history-chart').count() == 0, '没有历史接口的服务器不显示人数曲线')
    check('3 / 40' in page.locator('.m-minecraft__online').inner_text(), '切换到自定义服务器')
    page.get_by_role('button', name='复制地址', exact=True).click()
    check(page.evaluate('navigator.clipboard.readText()') == 'mc.example.com:25565', '用户自定义复制地址操作')

    # 经过刷新间隔，监控也不主动轮询；切回前台不发起额外监控请求。
    before = counts['snapshot']
    page.clock.fast_forward(3700000)
    page.wait_for_timeout(300)
    check(counts['snapshot'] == before, '监控没有定时轮询')
    page.evaluate('''() => { window.servicesHidden=true; Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.servicesHidden?'hidden':'visible'}); document.dispatchEvent(new Event('visibilitychange')); }''')
    page.wait_for_timeout(100)
    page.evaluate("() => { window.servicesHidden=false; document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_timeout(200)
    check(counts['snapshot'] == before, '监控切回前台不主动重新检测')
    page.locator('.m-status').get_by_role('button', name='刷新状态', exact=True).click()
    page.wait_for_timeout(300)
    check(counts['snapshot'] == before + 1, '间隔后手动刷新读取新快照')
    page.emulate_media(color_scheme='light')
    page.wait_for_timeout(800)
    page.screenshot(path='artifacts/services-light.png', full_page=True)
    page.wait_for_timeout(400)
    page.reload()
    page.wait_for_selector('.m-minecraft__online')
    page.wait_for_selector('.m-currency__result')
    check('测试服务器' in page.locator('.m-minecraft__server').inner_text(), '服务器设置持久化')
    check('BTC' in page.locator('.m-currency__pair').inner_text(), '币种设置持久化')
    page.locator('.m-status').get_by_role('button', name='组件设置').click()
    page.get_by_label('历史接口（可选）', exact=True).fill('')
    page.get_by_role('button', name='保存', exact=True).click()
    page.wait_for_timeout(300)
    check(page.locator('.m-status .m-history-chart').count() == 0, '清空监控历史接口可停止加载曲线')
    browser.close()

print('\n'.join(errors) if errors else 'ALL OK')
sys.exit(1 if errors else 0)
