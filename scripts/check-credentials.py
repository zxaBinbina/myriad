"""Credential form regression against an isolated local Worker; never production credentials.

Start playground on 4180 and an isolated Worker on 8799. Set MYRIAD_TOKEN_FILE.
Upstream widget reads are mocked; vault saves and feature discovery use the real Worker.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
API = os.environ.get('MYRIAD_API_URL', 'http://127.0.0.1:8799')
if urlparse(API).hostname not in ('localhost', '127.0.0.1'):
    raise RuntimeError('Credential tests require an isolated local Worker.')
TOKEN = Path(os.environ.get('MYRIAD_TOKEN_FILE', '/tmp/myriad-vault-test/token.txt')).read_text().strip()
errors, uploads = [], []
def check(value, message):
    print(('PASS ' if value else 'FAIL ') + message, flush=True)
    if not value: errors.append(message)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    context = browser.new_context(viewport={'width': 1600, 'height': 1150}, locale='zh-CN', timezone_id='Asia/Shanghai')
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: uploads.append(r.post_data or '') if '/me/credentials/' in r.url and r.method == 'PUT' else None)
    def widget_read(route):
        section = route.request.url.split('section=')[-1].split('&')[0]
        if '/github' in route.request.url:
            route.fulfill(json={'section': section, 'personal': '/me/' in route.request.url, 'repos': [], 'notifications': []})
        elif '/weather' in route.request.url:
            route.fulfill(json={'provider': 'open-meteo', 'current': {'temperature_2m': 20, 'weather_code': 0}, 'hourly': {}, 'daily': {}})
        else:
            route.fulfill(json={'text': '测试译文'})
    context.route(API + '/v1/me/github?*', widget_read)
    context.route(API + '/v1/github?*', widget_read)
    context.route(API + '/v1/me/weather?*', widget_read)
    context.route(API + '/v1/me/translate', widget_read)
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_timeout(400)
    data = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    data['items']['tr-vault'] = {'id': 'tr-vault', 'type': 'widget', 'kind': 'translation', 'size': '4x4', 'config': {'services': ['baidu']}}
    data['items']['gh-vault'] = {'id': 'gh-vault', 'type': 'widget', 'kind': 'github', 'size': '2x2', 'config': {}}
    data['groups'][0]['items'] = ['tr-vault', 'gh-vault']
    page.evaluate('''({data, api, token}) => {
      localStorage.setItem('myriad.data', JSON.stringify(data));
      const local = JSON.parse(localStorage.getItem('myriad.local'));
      local.activeGroup = data.groups[0].id;
      local.sync = {...local.sync, enabled: true, authMode: 'token', apiBase: api, token};
      localStorage.setItem('myriad.local', JSON.stringify(local));
    }''', {'data': data, 'api': API, 'token': TOKEN})
    page.reload()
    page.wait_for_timeout(1000)
    other = context.new_page()
    other.goto(URL)
    other.wait_for_timeout(700)
    page.keyboard.press('Alt+,')
    page.get_by_role('button', name='服务密钥', exact=True).click()
    form = page.locator('form.m-service-credentials')
    expect(form).to_contain_text('GitHub · 未配置')
    github = form.locator('details').filter(has=page.locator('summary', has_text='GitHub'))
    github.locator('summary').click()
    github.get_by_label('API Key / Secret / Token', exact=True).fill('browser-test-only-github-secret')
    github.get_by_label('API Key / Secret / Token', exact=True).press('Enter')
    expect(form).to_contain_text('GitHub · 已配置')
    expect(other.locator('[data-widget="github"]')).to_contain_text('已连接私有数据')
    check(True, '另一标签页立即收到凭据能力更新')
    check(github.get_by_label('API Key / Secret / Token', exact=True).input_value() == '', '保存后密钥不回显')
    check(uploads and all('browser-test-only' not in value and '"iv"' in value for value in uploads), '真实 Worker 请求体仅含密文')
    check('browser-test-only' not in page.evaluate('JSON.stringify({...localStorage})'), '第三方密钥不进入本机存储、同步文档或缓存')
    uploads_before = len(uploads)
    form.get_by_role('button', name='保存服务密钥', exact=True).click()
    check(len(uploads) == uploads_before, '空白表单保留已有密钥且不重复上传')
    state = page.evaluate('''async ({api, token}) => (await (await fetch(api+'/v1/me', {headers:{Authorization:'Bearer '+token}})).json()).features''', {'api': API, 'token': TOKEN})
    check(state['githubPrivate'] and state['credentialRevision'], '保存后私有服务能力立即生效')
    page.reload()
    page.wait_for_timeout(800)
    page.keyboard.press('Alt+,')
    page.get_by_role('button', name='服务密钥', exact=True).click()
    expect(form).to_contain_text('GitHub · 已配置')
    check(form.locator('input[type="password"]').evaluate_all('(inputs)=>inputs.every(i=>!i.value)'), '刷新后只读取配置状态，不返回明文密钥')
    github.locator('summary').click()
    # Simulate one failed save without modifying the real Worker credential.
    page.route(API+'/v1/me/credentials/github', lambda route: route.fulfill(status=503, json={'error':'test-disabled'}), times=1)
    field = github.get_by_label('API Key / Secret / Token', exact=True)
    field.fill('browser-test-only-retry-secret')
    form.get_by_role('button', name='保存服务密钥', exact=True).click()
    expect(form.get_by_role('alert')).to_be_visible()
    check(field.input_value() == 'browser-test-only-retry-secret', '上传失败保留输入以便重试')
    form.get_by_role('button', name='保存服务密钥', exact=True).click()
    expect(form).to_contain_text('服务密钥已加密保存')
    # Endpoint changes require entering a key again.
    openai = form.locator('details').filter(has=page.locator('summary', has_text='OpenAI'))
    openai.locator('summary').click()
    openai.get_by_label('API Key / Secret / Token', exact=True).fill('browser-test-only-model-secret')
    openai.get_by_label('完整 API 地址', exact=True).fill('https://model.example/v1/chat/completions')
    openai.get_by_label('模型', exact=True).fill('test-model')
    form.get_by_role('button', name='保存服务密钥', exact=True).click()
    expect(openai).to_contain_text('已配置')
    openai.get_by_label('完整 API 地址', exact=True).fill('https://changed.example/v1/chat/completions')
    form.get_by_role('button', name='保存服务密钥', exact=True).click()
    expect(form.get_by_role('alert')).to_be_visible()
    check(openai.get_by_label('完整 API 地址', exact=True).input_value().startswith('https://changed.'), '大模型密钥不能静默发送到更换的地址')
    openai.get_by_label('完整 API 地址', exact=True).fill('')
    # Widget settings share the same vault and save through the parent form.
    page.keyboard.press('Escape')
    widget = page.locator('[data-widget="translation"]')
    widget.get_by_role('button', name='组件设置', exact=True).click()
    dialog = page.get_by_role('dialog', name='翻译 · 组件设置', exact=True)
    expect(dialog.get_by_label('Worker 加密保存并转发', exact=True)).to_be_checked()
    credential = dialog.locator('.m-service-credentials')
    credential.get_by_label('App ID / App Key / Secret ID', exact=True).fill('browser-test-only-app-id')
    credential.get_by_label('API Key / Secret / Token', exact=True).fill('browser-test-only-baidu-secret')
    dialog.get_by_role('button', name='保存', exact=True).click()
    expect(dialog).not_to_be_visible()
    check(all('browser-test-only' not in value for value in uploads), '小组件保存也使用加密凭据接口')
    widget.get_by_label('要翻译的文字', exact=True).fill('Hello world')
    with page.expect_request(API+'/v1/me/translate') as request:
        widget.get_by_role('button', name='翻译', exact=True).click()
    check(json.loads(request.value.post_data)['provider']=='baidu', '官方翻译服务通过 Worker 执行')
    expect(widget).to_contain_text('测试译文')
    check('browser-test-only' not in page.evaluate('JSON.stringify({...localStorage})'), '小组件密钥也不写普通同步数据或本机存储')
    # No nested forms, and every visible secret input has a visible associated label.
    page.keyboard.press('Alt+,')
    page.get_by_role('button', name='服务密钥', exact=True).click()
    check(page.locator('form form').count()==0, '密钥表单无嵌套 form')
    github.locator('summary').click()
    github.get_by_role('button', name='删除已保存的凭据', exact=True).click()
    expect(github).to_contain_text('GitHub · 未配置')
    check(True, '删除后立即清除配置状态')
    Path('artifacts').mkdir(exist_ok=True)
    page.screenshot(path='artifacts/service-credentials.png')
    # Change the Worker address after entering a draft: discard the old target's draft.
    github.get_by_label('API Key / Secret / Token', exact=True).fill('browser-test-only-must-not-transfer')
    page.get_by_role('button', name='同步', exact=True).click()
    page.get_by_role('button', name='断开', exact=True).click()
    page.locator('dialog[open]').get_by_role('button', name='断开', exact=True).click()
    page.get_by_label('服务地址', exact=True).fill('http://127.0.0.1:8800')
    page.get_by_role('button', name='服务密钥', exact=True).click()
    expect(page.locator('form.m-service-credentials')).to_contain_text('请先在同步设置中使用连接令牌连接 Worker')
    check('browser-test-only-must-not-transfer' not in form.inner_text(), 'Worker 地址更换后旧草稿不会上传到新服务')
    context.close(); browser.close()
assert not errors, errors
print('ALL OK')
