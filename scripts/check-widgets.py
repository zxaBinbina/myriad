"""M3 首批组件：固定上游数据，验证缓存、设置、尺寸与后台取消请求。"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
BROWSER = os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome')
errors = []
counts = {'quote': 0, 'weather': 0, 'air': 0, 'city': 0}

def check(condition, message):
    print(('PASS ' if condition else 'FAIL ') + message)
    if not condition:
        errors.append(message)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=BROWSER, headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='zh-CN', timezone_id='Asia/Shanghai', permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    page.emulate_media(color_scheme='dark')
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_selector('.m-grid .m-tile')
    page.wait_for_timeout(500)
    seed = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    items = [
        {'id': 'test-weather', 'type': 'widget', 'kind': 'weather', 'size': '4x2', 'config': {'cities': [{'name': '北京', 'latitude': 39.9, 'longitude': 116.4}]}},
        {'id': 'test-quote', 'type': 'widget', 'kind': 'quote', 'size': '2x2', 'config': {}},
        {'id': 'test-quote2', 'type': 'widget', 'kind': 'quote', 'size': '2x2', 'config': {}},
        {'id': 'test-countdown', 'type': 'widget', 'kind': 'countdown', 'size': '2x2', 'config': {}},
    ]
    seed['items'].update({item['id']: item for item in items})
    seed['groups'][0]['items'] = [item['id'] for item in items]
    page.evaluate('(data) => { localStorage.setItem("myriad.data", JSON.stringify(data)); const local = JSON.parse(localStorage.getItem("myriad.local")); local.activeGroup = data.groups[0].id; localStorage.setItem("myriad.local", JSON.stringify(local)); }', seed)
    current = '2026-11-14T12:15'
    weather = {
        'current': {'time': current, 'temperature_2m': 18, 'apparent_temperature': 16, 'weather_code': 1, 'is_day': 1},
        'hourly': {'time': [f'2026-11-14T{hour:02}:00' for hour in range(13, 22)], 'temperature_2m': [18]*9, 'weather_code': [1]*9},
        'daily': {'time': [f'2026-11-{day}' for day in range(14, 21)], 'weather_code': [1]*7, 'temperature_2m_min': [8]*7, 'temperature_2m_max': [20]*7, 'sunrise': ['2026-11-14T06:40']*7, 'sunset': ['2026-11-14T17:00']*7},
    }
    def fulfill(route, kind, data):
        counts[kind] += 1
        route.fulfill(json=data, headers={'Access-Control-Allow-Origin': '*'})
    context.route('https://api.open-meteo.com/**', lambda r: fulfill(r, 'weather', weather))
    context.route('https://air-quality-api.open-meteo.com/**', lambda r: fulfill(r, 'air', {'current': {'us_aqi': 42}}))
    context.route('https://v1.hitokoto.cn/**', lambda r: fulfill(r, 'quote', {'id': 7, 'hitokoto': '每一天都是新的起点。', 'from': '测试'}))
    context.route('https://geocoding-api.open-meteo.com/**', lambda r: fulfill(r, 'city', {'results': [{'name': '上海', 'country': '中国', 'latitude': 31.23, 'longitude': 121.47}]}))
    page.reload()
    page.wait_for_selector('.m-weather__current')
    page.wait_for_selector('.m-quote__text')
    check(counts['quote'] == 1, '两个一言实例共用一次每日请求')
    check(page.locator('.m-weather__forecast > div').count() == 7, '宽天气组件显示 7 天预报')
    check('AQI 42' in page.locator('.m-weather').inner_text(), '天气显示体感、空气质量与日出日落')
    check(page.locator('.m-countdown h4').inner_text() == '悠哉世界开服纪念日', '默认开服纪念日')
    page.locator('[data-drop-item="test-quote"] .m-quote__body').click()
    check(page.evaluate('navigator.clipboard.readText()') == '每一天都是新的起点。', '点击一言复制')
    page.locator('[data-drop-item="test-quote"]').get_by_role('button', name='收藏', exact=True).click()
    page.locator('[data-drop-item="test-quote"]').get_by_role('button', name='组件设置').click()
    page.get_by_role('switch', name='每天从收藏中选一句').click()
    page.get_by_role('button', name='保存', exact=True).click()
    page.wait_for_timeout(400)
    check('每一天都是新的起点。' in page.locator('[data-drop-item="test-quote"]').inner_text(), '收藏模式可用')
    check(not page.locator('[data-drop-item="test-quote"] .m-quote__footer a').count(), '收藏模式不访问每日接口')
    # 设置中的城市查询不进入搜索框，不启动拖动。
    page.locator('[data-drop-item="test-weather"]').get_by_role('button', name='组件设置').click()
    page.get_by_placeholder('输入城市名或拼音').fill('上海')
    page.get_by_role('button', name='搜索城市', exact=True).click()
    page.get_by_role('button', name='上海 · 中国').click()
    page.get_by_text('添加经纬度', exact=True).click()
    page.get_by_label('位置名称', exact=True).fill('经纬度测试')
    page.get_by_label('纬度', exact=True).fill('0')
    page.get_by_label('经度', exact=True).fill('120.5')
    page.locator('.m-widget-editor__manual').get_by_role('button', name='添加', exact=True).click()
    check(page.locator('.m-widget-editor__cities').get_by_text('经纬度测试', exact=True).count() == 1, '手动经纬度允许零与小数，不出现数字输入类型错误')
    page.get_by_role('button', name='移除城市 经纬度测试', exact=True).click()
    page.get_by_role('combobox', name='温度单位').select_option('fahrenheit')
    page.get_by_role('button', name='保存', exact=True).click()
    check('64' in page.locator('.m-weather__current').inner_text(), '温度单位切换为华氏度')
    check(page.locator('.m-search__input').input_value() == '', '组件设置输入不触发全局搜索')
    page.locator('.m-weather__cities').select_option('1')
    page.wait_for_timeout(400)
    check(counts['weather'] == 2, '切换保存城市才读取对应天气')
    # 尺寸 2x4 显示小时预报，使用缓存。
    page.locator('[data-drop-item="test-weather"]').click(button='right')
    page.locator('.m-menu__item', has_text='尺寸').hover()
    page.locator('.m-menu__item', has_text='2 × 4').click()
    page.wait_for_timeout(400)
    check(page.locator('.m-weather__hourly > div').count() == 8, '高天气组件显示逐小时预报')
    page.screenshot(path='artifacts/widgets-dark.png', full_page=True)
    page.wait_for_timeout(600)
    count_before = dict(counts)
    page.reload(); page.wait_for_selector('.m-weather__current'); page.wait_for_selector('.m-quote__text')
    check(counts == count_before, '刷新页面仍使用天气与每日一言缓存')
    check(page.locator('.m-weather__cities').input_value() == '1', '城市选择持久化')
    second = context.new_page()
    second.goto(URL); second.wait_for_selector('.m-quote__text')
    check(counts == count_before, '新标签页不重复请求已缓存的资源')
    second.close()
    # 移到视口外，程序触发刷新也不能请求数据。
    page.locator('.m-weather').evaluate("el => el.closest('.m-tile').style.transform = 'translateY(2000px)'")
    page.wait_for_timeout(200)
    page.locator('.m-weather').get_by_role('button', name='刷新天气').evaluate('el => el.click()')
    page.wait_for_timeout(200)
    check(counts == count_before, '视口外的小组件不请求数据')
    page.locator('.m-weather').evaluate("el => el.closest('.m-tile').style.transform = ''")
    page.wait_for_timeout(200)
    # 设置后台状态；即便缓存被移除，也不能触发请求。
    page.evaluate('''() => { window.widgetHidden = true; Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => window.widgetHidden ? 'hidden' : 'visible'}); document.dispatchEvent(new Event('visibilitychange')); }''')
    page.locator('.m-weather').get_by_role('button', name='刷新天气').click()
    page.wait_for_timeout(300)
    check(counts == count_before, '后台不发起天气刷新')
    page.evaluate("() => { window.widgetHidden = false; document.dispatchEvent(new Event('visibilitychange')); }")
    # 悬挂上游请求后隐藏页面，fetch 必须取消。
    canceled = []
    page.on('requestfailed', lambda request: canceled.append(request.url))
    context.unroute('https://api.open-meteo.com/**')
    pending = []
    context.route('https://api.open-meteo.com/**', lambda route: pending.append(route))
    page.locator('.m-weather').get_by_role('button', name='刷新天气').click()
    page.wait_for_timeout(200)
    check(len(pending) == 1, '测试已发起未完成的天气请求')
    page.evaluate("() => { window.widgetHidden = true; document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_timeout(300)
    check(any('api.open-meteo.com' in url for url in canceled), '切后台取消正在加载的请求')
    for route in pending:
        try:
            route.abort()
        except Exception:
            pass
    context.unroute('https://api.open-meteo.com/**')
    page.evaluate("() => { window.widgetHidden = false; document.dispatchEvent(new Event('visibilitychange')); }")
    context.route('https://api.open-meteo.com/**', lambda r: fulfill(r, 'weather', weather))
    # 改到次日：useNow 的日期变化必须换缓存键，并只获取一条新句子。
    before_quote = counts['quote']
    page.clock.set_system_time(datetime.now(timezone.utc) + timedelta(days=1))
    page.wait_for_timeout(1300)
    check(counts['quote'] == before_quote + 1, '跨过本地午夜后获取下一天的一言')
    # 切到没有这些组件的分组，然后刷新，不访问它们的数据源。
    page.locator('.m-groups__tab').nth(1).click(); page.wait_for_timeout(600)
    count_before = dict(counts)
    page.reload(); page.wait_for_selector('.m-grid .m-tile'); page.wait_for_timeout(300)
    check(counts == count_before, '非当前分组的小组件不请求数据')
    browser.close()

print('\n'.join(errors) if errors else 'ALL OK')
sys.exit(1 if errors else 0)
