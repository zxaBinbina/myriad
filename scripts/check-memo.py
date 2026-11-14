"""待办、共享清单、Markdown、提醒与加密的浏览器回归；仅使用隔离本机数据。"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
BROWSER = os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome')
Path('artifacts').mkdir(exist_ok=True)
errors = []

def check(condition, message):
    print(('PASS ' if condition else 'FAIL ') + message, flush=True)
    if not condition:
        errors.append(message)

NOTIFICATIONS = """(() => {
  window.memoNotices=[]; window.memoPermission='default'; window.memoRequests=0;
  window.Notification=class {
    static get permission(){return window.memoPermission}
    static async requestPermission(){window.memoRequests++;return window.memoPermission=window.memoDeny?'denied':'granted'}
    constructor(title,options){window.memoNotices.push({title,...options})}
  };
})()"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=BROWSER, headless=True)
    context = browser.new_context(viewport={'width': 1600, 'height': 1150}, locale='zh-CN', timezone_id='Asia/Shanghai')
    context.add_init_script(NOTIFICATIONS)
    page = context.new_page()
    page.clock.install(time=datetime(2026, 11, 14, 2, 0, tzinfo=timezone.utc))
    page.emulate_media(color_scheme='dark')
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_timeout(500)
    data = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    widgets = [
        {'id': 'memo-a', 'kind': 'memo', 'size': '4x4', 'config': {'listId': 'shared', 'view': 'tasks'}},
        {'id': 'memo-b', 'kind': 'memo', 'size': '4x4', 'config': {'listId': 'shared', 'view': 'note'}},
        {'id': 'calendar-test', 'kind': 'calendar', 'size': '4x4', 'config': {}},
        {'id': 'countdown-test', 'kind': 'countdown', 'size': '2x4', 'config': {}},
    ]
    data['items'].update({w['id']: dict(w, type='widget') for w in widgets})
    data['groups'][0]['items'] = [w['id'] for w in widgets]
    data['lists'] = {'shared': {'id': 'shared', 'protection': 'plain', 'keyId': '', 'salt': '', 'order': [], 'fields': {'title': json.dumps('共享测试清单'), 'note': json.dumps('')}}}
    page.evaluate('d => {localStorage.setItem("myriad.data",JSON.stringify(d));const l=JSON.parse(localStorage.getItem("myriad.local"));l.activeGroup=d.groups[0].id;localStorage.setItem("myriad.local",JSON.stringify(l))}', data)
    page.reload()
    a, b = page.locator('.m-memo').nth(0), page.locator('.m-memo').nth(1)
    expect(a.locator('.m-memo__title')).to_contain_text('共享测试清单')
    check(page.evaluate('window.memoRequests') == 0, '未使用提醒时不申请通知权限')

    a.locator('.m-memo__advanced').press('Enter')
    dialog = page.get_by_role('dialog', name='添加任务', exact=True)
    dialog.get_by_label('任务内容', exact=True).fill('普通任务')
    dialog.get_by_label('任务内容', exact=True).press('Enter')
    expect(a.get_by_role('button', name='编辑 普通任务', exact=True)).to_be_visible()
    b.get_by_role('button', name='待办', exact=True).click()
    expect(b.get_by_role('button', name='编辑 普通任务', exact=True)).to_be_visible()
    check(page.locator('.m-search input').first.input_value() == '', '编辑待办不触发全局搜索')
    check(b.locator('.m-memo__tasks > li').count() == 1, '两个组件引用同一清单')

    def new_task(title, due, repeat='none', reminder='off', at=''):
        a.locator('.m-memo__advanced').press('Enter')
        dialog = page.get_by_role('dialog', name='添加任务', exact=True)
        dialog.get_by_label('任务内容', exact=True).fill(title)
        dialog.get_by_label('截止日期', exact=True).fill(due)
        if at:
            dialog.get_by_label('截止时间', exact=True).fill(at)
        dialog.get_by_role('combobox', name='重复', exact=True).select_option(repeat)
        dialog.get_by_role('combobox', name='提醒', exact=True).select_option(reminder)
        return dialog

    dialog = new_task('月底复盘', '2026-11-30', repeat='month')
    dialog.get_by_role('combobox', name='优先级').select_option('3')
    dialog.get_by_role('combobox', name='颜色标签').select_option('red')
    dialog.get_by_role('textbox', name='添加子任务', exact=True).fill('检查报表')
    dialog.get_by_role('button', name='添加子任务', exact=True).click()
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(a.locator('.is-red')).to_contain_text('月底复盘')
    check('高' in a.locator('.is-red').inner_text(), '任务优先级与颜色标签')
    a.get_by_role('checkbox', name='检查报表', exact=True).check()
    expect(b.get_by_role('checkbox', name='检查报表', exact=True)).to_be_checked()
    expect(page.locator('.m-countdown__tasks')).to_contain_text('月底复盘')
    check(page.locator('.m-countdown__tasks button').count() == 1, '共享清单在倒数日去重')
    check(page.locator('.m-cal__task-dot').count() == 1, '截止日期在日历显示标记')
    page.locator('.m-cal__day').filter(has=page.locator('.m-cal__task-dot')).click()
    expect(page.locator('.m-cal__tasks')).to_contain_text('月底复盘')
    page.locator('.m-cal__tasks button').click()
    expect(page.get_by_role('dialog', name='编辑任务')).to_be_visible()
    page.get_by_role('dialog', name='编辑任务').get_by_role('button', name='取消', exact=True).click()

    # 真正的 HTML 拖拽只调整清单内部，不挪动整个组件。
    a.locator('.m-memo__tasks > li').nth(1).locator('.m-memo__grip').drag_to(a.locator('.m-memo__tasks > li').first)
    expect(a.locator('.m-memo__task-title').first).to_have_text('月底复盘')
    expect(b.locator('.m-memo__task-title').first).to_have_text('月底复盘')
    check(True, '拖拽排序在共享组件中同步')

    a.get_by_role('checkbox', name='完成 月底复盘', exact=True).click()
    expect(a.locator('.m-memo__tasks')).to_contain_text('2026-12-30')
    check(a.locator('.m-memo__completed').first.get_attribute('open') is None, '完成任务默认折叠')
    a.locator('.m-memo__completed').first.locator('summary').click()
    expect(a.get_by_role('checkbox', name='恢复 月底复盘', exact=True)).to_be_visible()
    a.locator('.m-memo__tasks').get_by_role('button', name='编辑 月底复盘', exact=True).click()
    dialog = page.get_by_role('dialog', name='编辑任务')
    dialog.get_by_label('截止日期', exact=True).fill('2026-12-31')
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(dialog).not_to_be_visible()
    a.get_by_role('checkbox', name='完成 月底复盘', exact=True).click()
    expect(a.locator('.m-memo__tasks')).to_contain_text('2027-01-31')
    check(True, '重复任务生成下一次；编辑日期后重置循环锚点')

    a.get_by_role('button', name='组件设置', exact=True).click()
    settings = page.get_by_role('dialog').filter(has=page.get_by_role('combobox', name='清单', exact=True))
    settings.get_by_role('combobox', name='完成后的显示').select_option('archive')
    settings.get_by_role('button', name='保存', exact=True).click()
    expect(settings).not_to_be_visible()
    a.get_by_role('checkbox', name='完成 普通任务', exact=True).click()
    a.locator('.m-memo__completed').nth(1).locator('summary').click()
    expect(a.get_by_role('checkbox', name='恢复 普通任务', exact=True)).to_be_visible()
    a.get_by_role('checkbox', name='恢复 普通任务', exact=True).click()
    expect(a.locator('.m-memo__tasks')).to_contain_text('普通任务')
    check(True, '自动归档与恢复')

    # 可关闭联动；隐藏组件中的共享引用仍保留清单内容。
    for widget in (a, b):
        widget.get_by_role('button', name='组件设置', exact=True).click()
        dialog = page.get_by_role('dialog').filter(has=page.get_by_role('combobox', name='清单', exact=True))
        dialog.get_by_role('switch', name='在日历与倒数日中显示截止任务', exact=True).click()
        dialog.get_by_role('button', name='保存', exact=True).click()
        expect(dialog).not_to_be_visible()
    expect(page.locator('.m-countdown__tasks')).not_to_be_visible()
    check(page.locator('.m-cal__task-dot').count() == 0, '清单联动可关闭，日历和倒数日同时隐藏截止任务')
    a.get_by_role('button', name='组件设置', exact=True).click()
    dialog = page.get_by_role('dialog').filter(has=page.get_by_role('combobox', name='清单', exact=True))
    dialog.get_by_role('switch', name='在日历与倒数日中显示截止任务', exact=True).click()
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(page.locator('.m-countdown__tasks')).to_be_visible()
    a.get_by_role('button', name='编辑 普通任务', exact=True).click()
    page.get_by_role('dialog', name='编辑任务').get_by_role('button', name='删除任务', exact=True).click()
    page.get_by_role('dialog').filter(has=page.get_by_text('删除待办「普通任务」？', exact=True)).get_by_role('button', name='确定', exact=True).click()
    expect(a.locator('.m-memo__tasks')).not_to_contain_text('普通任务')
    expect(b.locator('.m-memo__tasks')).not_to_contain_text('普通任务')
    check(True, '删除任务在所有共享实例生效')

    # 提醒两种权限结果；网页通知只在页面打开时运行。
    page.evaluate('window.memoDeny=true')
    dialog = new_task('拒权提醒', '2026-11-14', reminder='at', at='09:59')
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(dialog).not_to_be_visible()
    expect(a.locator('.is-overdue').filter(has_text='拒权提醒')).to_be_visible()
    check(page.evaluate('window.memoRequests') == 1, '首次启用提醒才申请权限；拒绝后保留任务和高亮')
    page.evaluate('window.memoDeny=false')
    dialog = new_task('分钟提醒', '2026-11-14', reminder='at', at='10:01')
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(dialog).not_to_be_visible()
    page.clock.fast_forward(62000)
    page.wait_for_timeout(300)
    check(page.evaluate('window.memoNotices.filter(n=>n.title==="分钟提醒").length') == 1, '到期通知只发一次')
    expect(a.locator('.is-reminded').filter(has_text='分钟提醒')).to_be_visible()
    page.clock.fast_forward(2000)
    check(page.evaluate('window.memoNotices.filter(n=>n.title==="分钟提醒").length') == 1, '后续重排提醒不会重复通知')

    b.get_by_role('button', name='便签', exact=True).click()
    b.get_by_role('button', name='编辑便签', exact=True).click()
    markdown = '# 私密便签\n**加粗内容**\n- [x] 已检查\n<img src="https://evil.test/pixel" onerror="window.memoXss=1">\n<script>window.memoXss=1</script>\n[危险](javascript:alert(1))\n<input type="text"><input type="checkbox">'
    b.get_by_role('textbox', name='Markdown 内容').fill(markdown)
    b.get_by_role('button', name='保存', exact=True).click()
    expect(b.locator('.m-markdown h1')).to_have_text('私密便签')
    expect(b.locator('.m-markdown strong')).to_have_text('加粗内容')
    check(b.locator('.m-markdown img, .m-markdown script, .m-markdown input:not([disabled]), .m-markdown a[href^="javascript:"]').count() == 0, 'Markdown 保留格式，阻止脚本、远程图片与活动输入')
    check(page.evaluate('window.memoXss') is None, 'Markdown 不执行不可信 HTML')
    fallback = context.new_page()
    fallback.add_init_script("delete Element.prototype.setHTML")
    fallback.goto(URL)
    expect(fallback.locator('.m-memo').nth(1).locator('.m-markdown h1')).to_have_text('私密便签')
    check(fallback.locator('.m-markdown img, .m-markdown script, .m-markdown input:not([disabled]), .m-markdown a[href^="javascript:"]').count() == 0, '缺少原生 Sanitizer 时 DOMPurify 回退保留同样的安全限制')
    fallback.close()
    a.get_by_role('button', name='便签', exact=True).click()
    expect(a.locator('.m-markdown h1')).to_have_text('私密便签')
    page.screenshot(path='artifacts/memo-dark.png', full_page=True)

    # 模式转换重新映射全部实例，只把密文保存到新的清单。
    a.get_by_role('button', name='加密与密钥', exact=True).click()
    page.get_by_role('button', name='加密此清单', exact=True).click()
    expect(page.get_by_role('dialog', name='加密与密钥')).not_to_be_visible()
    expect(a.locator('.m-markdown h1')).to_have_text('私密便签')
    page.wait_for_timeout(500)
    saved = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    list_id = saved['items']['memo-a']['config']['listId']
    encrypted = saved['lists'][list_id]
    check(list_id != 'shared' and list_id == saved['items']['memo-b']['config']['listId'] and 'shared' not in saved['lists'], '加密转换更新全部共享引用并移除旧清单')
    check(all(v.startswith('e1:') for v in encrypted['fields'].values()), '加密清单各字段为完整认证密文')
    serialized = json.dumps(saved, ensure_ascii=False)
    check('私密便签' not in serialized and '月底复盘' not in serialized, '当前同步数据与普通备份不含清单明文')
    a.get_by_role('button', name='加密与密钥', exact=True).click()
    with page.expect_download() as download:
        page.get_by_role('button', name='导出密钥', exact=True).click()
    key_text = Path(download.value.path()).read_text()
    check(json.loads(key_text)['key'] not in serialized, '密钥单独导出，不进入普通数据')
    page.get_by_role('dialog', name='加密与密钥').get_by_role('button', name='关闭', exact=True).click()
    b.get_by_role('button', name='编辑便签', exact=True).click()
    b.get_by_role('textbox', name='Markdown 内容').fill('# 加密后的修改\n仍然保密')
    b.get_by_role('button', name='保存', exact=True).click()
    expect(a.locator('.m-markdown h1')).to_have_text('加密后的修改')
    page.wait_for_timeout(500)
    state = page.evaluate('Object.fromEntries(["myriad.data","myriad.settings","myriad.local","myriad-boot"].map(k=>[k,localStorage.getItem(k)]))')
    check('加密后的修改' not in state['myriad.data'], '加密模式编辑便签仍只保存密文')

    def isolated(incoming):
        c = browser.new_context(viewport={'width': 1600, 'height': 1150}, locale='zh-CN', timezone_id='Asia/Shanghai')
        q = c.new_page()
        q.on('pageerror', lambda e: errors.append(str(e)))
        q.goto(URL)
        q.evaluate('s=>{localStorage.clear();for(const [k,v] of Object.entries(s))if(v!==null)localStorage.setItem(k,v)}', incoming)
        q.reload()
        q.wait_for_selector('.m-memo')
        return c, q

    other, q = isolated(state)
    expect(q.locator('.m-memo').first).to_contain_text('清单已加密')
    q.locator('.m-memo').first.get_by_role('button', name='导入密钥', exact=True).click()
    wrong = json.loads(key_text)
    wrong['key'] = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
    q.get_by_label('粘贴密钥 JSON').fill(json.dumps(wrong))
    q.get_by_role('button', name='解锁清单', exact=True).click()
    expect(q.get_by_role('alert')).to_contain_text('不匹配')
    check(json.loads(q.evaluate('localStorage.getItem("myriad.data")'))['lists'] == json.loads(state['myriad.data'])['lists'], '错误密钥不修改加密内容')
    q.get_by_label('粘贴密钥 JSON').fill(key_text)
    q.get_by_role('button', name='解锁清单', exact=True).click()
    expect(q.locator('.m-memo').first.locator('.m-markdown h1')).to_have_text('加密后的修改')
    check(True, '独立浏览器上下文导入密钥后解锁共享清单')
    q.reload()
    expect(q.locator('.m-memo').first.locator('.m-markdown h1')).to_have_text('加密后的修改')
    check(True, '加密清单与本机密钥重载后恢复')
    other.close()

    # 口令派生与禁用加密；同样在独立上下文验证。
    a.get_by_role('button', name='加密与密钥', exact=True).click()
    page.get_by_role('button', name='改为明文同步', exact=True).click()
    page.get_by_role('dialog').filter(has=page.get_by_text('改为明文后，清单内容会按现有同步设置上传。', exact=True)).get_by_role('button', name='确定', exact=True).click()
    expect(page.get_by_role('dialog', name='加密与密钥')).not_to_be_visible()
    a.get_by_role('button', name='加密与密钥', exact=True).click()
    page.get_by_role('switch', name='使用口令生成密钥', exact=True).click()
    phrase = '测试口令 twelve chars'
    page.get_by_label('加密口令', exact=True).fill(phrase)
    page.get_by_label('确认口令', exact=True).fill(phrase)
    page.get_by_role('button', name='加密此清单', exact=True).click()
    expect(page.get_by_role('dialog', name='加密与密钥')).not_to_be_visible(timeout=15000)
    page.wait_for_timeout(500)
    state = page.evaluate('Object.fromEntries(["myriad.data","myriad.settings","myriad.local","myriad-boot"].map(k=>[k,localStorage.getItem(k)]))')
    other, q = isolated(state)
    q.locator('.m-memo').first.get_by_role('button', name='导入密钥', exact=True).click()
    q.get_by_role('switch', name='使用口令生成密钥', exact=True).click()
    q.get_by_label('加密口令', exact=True).fill(phrase)
    q.get_by_role('button', name='解锁清单', exact=True).click()
    expect(q.locator('.m-memo').first.locator('.m-markdown h1')).to_have_text('加密后的修改', timeout=15000)
    check(True, '口令派生密钥支持独立设备解锁')
    other.close()
    page.emulate_media(color_scheme='light')
    page.wait_for_timeout(400)
    page.screenshot(path='artifacts/memo-light.png', full_page=True)
    browser.close()

print('\n'.join(errors) if errors else 'ALL OK')
raise SystemExit(1 if errors else 0)
