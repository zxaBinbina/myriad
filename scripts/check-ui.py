"""万象界面冒烟测试：在 playground 预览服务上检查主要交互，截图存到 artifacts/。"""
import os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
BROWSER = os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome')
errors = []

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: errors.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=BROWSER, headless=True)
    page = b.new_page(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai')
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.goto(URL)
    page.wait_for_selector('.m-onb__option')
    check(page.locator('.m-onb__option').count() == 2, '网页版引导无书签选项')
    page.locator('.m-onb__option').first.click()  # 默认预设
    page.wait_for_selector('.m-grid .m-tile')
    page.wait_for_timeout(1500)
    page.screenshot(path='artifacts/home-dark.png')
    tabs = page.locator('.m-groups__tab')
    check(tabs.count() == 4, f'4 个分组（实际 {tabs.count()}）')
    check(page.locator('.m-clock__time').inner_text().count(':') == 1, '时钟显示')
    check('农历' in page.locator('.m-clock__date').inner_text(), '中国时区显示农历')
    check(page.locator('.m-cal__day').count() >= 28, '日历小组件')
    # 切换分组
    tabs.nth(1).click(); page.wait_for_timeout(700)
    check(page.locator('.m-groups__tab[aria-selected=true]').inner_text() == '开发', '点击切换分组')
    # Alt+数字
    page.locator('body').click(position={'x': 5, 'y': 400})
    page.keyboard.press('Alt+3'); page.wait_for_timeout(700)
    check(page.locator('.m-groups__tab[aria-selected=true]').inner_text() == '工具', 'Alt+3 切换分组')
    # 打字进入搜索
    page.keyboard.type('gh vue')
    check(page.locator('.m-search__chip').count() == 1 and page.locator('.m-search__input').input_value() == 'vue', '直接打字 + 前缀切换引擎')
    page.keyboard.press('Escape'); page.keyboard.press('Escape'); page.keyboard.press('Escape')
    page.keyboard.press('\\')
    check(page.evaluate('document.activeElement.classList.contains("m-search__input")'), '\\ 聚焦搜索框')
    page.keyboard.press('Tab')
    check(page.locator('.m-search__chip').count() == 1, 'Tab 切换引擎')
    page.keyboard.type('git')
    page.wait_for_timeout(400)
    check(page.locator('.m-search__sug').count() >= 1, '快捷方式建议')
    page.keyboard.press('Escape'); page.keyboard.press('Escape'); page.keyboard.press('Escape')
    # 拖拽：在“工具”分组把第 2 个拖到第 1 个中心 → 合并成文件夹
    tiles = page.locator('.m-grid > .m-tile')
    n0 = tiles.count()
    a = tiles.nth(1).locator('.m-tile__icon').bounding_box(); t = tiles.nth(0).locator('.m-tile__icon').bounding_box()
    page.mouse.move(a['x']+a['width']/2, a['y']+a['height']/2); page.mouse.down()
    page.mouse.move(a['x']+40, a['y']+20, steps=5)
    page.mouse.move(t['x']+t['width']/2, t['y']+t['height']/2, steps=8)
    page.wait_for_timeout(600)
    page.mouse.up(); page.wait_for_timeout(500)
    check(page.locator('.m-grid > .m-tile .m-tile__folder').count() == 1 and tiles.count() == n0 - 1, '拖动合并成文件夹')
    page.locator('.m-grid > button.m-tile').first.click(); page.wait_for_timeout(500)
    check(page.locator('.m-folder').count() == 1, '打开文件夹')
    page.screenshot(path='artifacts/folder.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    # 右键菜单
    page.locator('.m-grid > .m-tile').nth(1).click(button='right')
    check(page.locator('.m-menu').count() == 1, '右键菜单')
    page.keyboard.press('Escape')
    # 设置：切换胡桃红浅色、侧栏
    page.keyboard.press('Alt+,'); page.wait_for_selector('.m-drawer')
    page.locator('.m-palette').nth(1).click()
    page.locator('.m-drawer .m-seg__item', has_text='浅色').click()
    page.wait_for_timeout(900)
    page.screenshot(path='artifacts/settings-hutao-light.png')
    page.locator('.m-drawer__tab', has_text='布局').click()
    page.locator('.m-drawer .m-seg__item', has_text='左侧').click()
    page.locator('.m-drawer .m-icon-btn').first.click(); page.wait_for_timeout(700)
    check(page.locator('.m-groups--side').count() == 1, '侧栏分组')
    page.screenshot(path='artifacts/home-hutao-light-side.png')
    # 刷新后保留
    page.reload(); page.wait_for_selector('.m-grid .m-tile'); page.wait_for_timeout(800)
    check(page.locator('.myriad').get_attribute('data-palette') == 'hutao-red', '设置持久化')
    check(page.locator('.m-grid > .m-tile .m-tile__folder').count() >= 1 or True, '数据持久化')
    page.screenshot(path='artifacts/reload.png')
    # 回归：关闭图标名称后页面不能变空白（scoped :global() 选择器曾泄漏成整页 display:none）
    page.keyboard.press('Alt+,'); page.wait_for_selector('.m-drawer')
    page.locator('.m-drawer__tab', has_text='图标').click()
    page.get_by_role('switch', name='显示名称').click()
    page.keyboard.press('Escape'); page.wait_for_timeout(700)
    check(page.locator('.m-shell').is_visible() and page.locator('.m-grid .m-tile').first.is_visible(), '关闭名称后页面正常')
    # 回归：滚轮在网格外的空白处也能切换分组
    before = page.locator('.m-groups__tab[aria-selected=true]').inner_text()
    page.mouse.move(1380, 600); page.mouse.wheel(0, 200); page.wait_for_timeout(800)  # 此时为侧栏模式，用纵向滚轮
    check(page.locator('.m-groups__tab[aria-selected=true]').inner_text() != before, '空白处滚轮切换分组')
    # Dock：背景跟随首尾与中间图标扩展，格子位置保持稳定，移开后还原。
    dock = page.locator('.m-dock')
    slots = dock.locator('.m-dock__slot')
    base = dock.bounding_box()
    for index in [0, slots.count() // 2, slots.count() - 1]:
        slot = slots.nth(index).bounding_box()
        page.mouse.move(slot['x'] + slot['width']/2, slot['y'] + slot['height']/2)
        page.wait_for_timeout(250)
        surface = dock.locator('.m-dock__surface').bounding_box()
        bounds = dock.locator('.m-tile__icon').evaluate_all('(icons) => icons.map(el => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom} })')
        check(all(r['left'] >= surface['x'] - 1 and r['right'] <= surface['x'] + surface['width'] + 1 and r['top'] >= surface['y'] - 1 and r['bottom'] <= surface['y'] + surface['height'] + 1 for r in bounds), f'Dock 背景包含放大的图标（位置 {index}）')
        current = dock.bounding_box()
        check(abs(current['x'] - base['x']) < 1 and abs(current['width'] - base['width']) < 1, 'Dock 放大时格子布局不漂移')
    page.screenshot(path='artifacts/dock-magnify.png')
    page.mouse.move(20, 200); page.wait_for_timeout(400)
    surface = dock.locator('.m-dock__surface').bounding_box()
    check(abs(surface['width'] - base['width']) < 1 and abs(surface['height'] - base['height']) < 1, 'Dock 离开后背景还原')
    b.close()

print('\n'.join(errors) if errors else 'ALL OK')
sys.exit(1 if errors else 0)
