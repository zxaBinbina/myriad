"""Translation regression using isolated storage and fixed mock upstreams; never real keys."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
errors = []
Path('artifacts').mkdir(exist_ok=True)

def check(value, message):
    print(('PASS ' if value else 'FAIL ') + message, flush=True)
    if not value:
        errors.append(message)

MOCK = """(() => {
const real=window.fetch;window.trRequests=[];window.trAborts=0;window.trHold=false;window.trDeny=false;
window.fetch=async (url,init={})=>{
 const u=String(url);
 if(!/deepl\\.com|microsofttranslator\\.com|fanyi-api\\.baidu\\.com|openapi\\.youdao\\.com|tmt\\.tencentcloudapi\\.com|model\\.example|worker\\.example/.test(u))return real(url,init);
 window.trRequests.push({url:u,method:init.method,headers:Object.fromEntries(new Headers(init.headers)),body:String(init.body)});
 if(window.trHold)await new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>{window.trAborts++;reject(new DOMException('Cancelled','AbortError'))},{once:true})});
 if(u.includes('deepl.com'))return Response.json({translations:[{text:'你好，世界',detected_source_language:'EN'}]});
 if(u.includes('microsofttranslator.com'))return window.trDeny?Response.json({error:'denied'},{status:401}):Response.json([{translations:[{text:'你好 · Microsoft'}],detectedLanguage:{language:'en'}}]);
 if(u.includes('baidu.com'))return Response.json({from:'en',trans_result:[{dst:'你好 · 百度'}]});
 if(u.includes('youdao.com'))return Response.json({errorCode:'0',translation:['你好 · 有道']});
 if(u.includes('tencentcloudapi.com'))return Response.json({Response:{TargetText:'你好 · 腾讯'}});
 if(u.includes('worker.example'))return Response.json({text:'你好 · Worker'});
 return Response.json({choices:[{message:{content:'<img src=x onerror=window.trXss=1> 大模型译文'}}]});
};
})()"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome'), headless=True)
    context = browser.new_context(viewport={'width': 1600, 'height': 1150}, locale='zh-CN', timezone_id='Asia/Shanghai', permissions=['clipboard-read', 'clipboard-write'])
    context.add_init_script(MOCK)
    page = context.new_page()
    page.emulate_media(color_scheme='dark')
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_timeout(500)
    data = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    data['items']['tr-test'] = {'id': 'tr-test', 'type': 'widget', 'kind': 'translation', 'size': '4x4', 'config': {'services': ['deepl', 'microsoft']}}
    data['groups'][0]['items'] = ['tr-test']
    data['groups'][1]['items'] = []
    page.evaluate('d=>{localStorage.setItem("myriad.data",JSON.stringify(d));const l=JSON.parse(localStorage.getItem("myriad.local"));l.activeGroup=d.groups[0].id;localStorage.setItem("myriad.local",JSON.stringify(l))}', data)
    page.reload()
    widget = page.locator('.m-translation')
    expect(widget).to_be_visible()
    page.wait_for_timeout(300)
    check(page.evaluate('trRequests.length') == 0, '显示组件不发送翻译请求')
    widget.get_by_label('要翻译的文字', exact=True).fill('Hello world')
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget).to_contain_text('请在组件设置中填写本机密钥')
    check(page.evaluate('trRequests.length') == 0, '缺少密钥时不访问上游')

    widget.get_by_role('button', name='组件设置', exact=True).click()
    settings = page.get_by_role('dialog', name='翻译 · 组件设置', exact=True)
    for label, key in [('DeepL', 'dummy-deepl-key'), ('Microsoft', 'dummy-ms-key')]:
        settings.get_by_role('group', name=label + ' · 本机密钥', exact=True).get_by_label('API Key / Secret', exact=True).fill(key)
    settings.get_by_role('button', name='保存', exact=True).click()
    expect(settings).not_to_be_visible()
    widget.get_by_label('要翻译的文字', exact=True).fill('IME sentence')
    widget.get_by_label('要翻译的文字', exact=True).dispatch_event('keydown', {'key': 'Enter', 'ctrlKey': True, 'isComposing': True})
    check(page.evaluate('trRequests.length') == 0, '输入法确认 Enter 不提交')
    widget.get_by_label('要翻译的文字', exact=True).press('Enter')
    check(page.evaluate('trRequests.length') == 0, '普通 Enter 保留多行输入')
    widget.get_by_label('要翻译的文字', exact=True).press('Control+Enter')
    expect(widget.locator('[data-provider="deepl"]')).to_contain_text('你好，世界')
    expect(widget.locator('[data-provider="microsoft"]')).to_contain_text('你好 · Microsoft')
    check(page.evaluate('trRequests.length') == 2, 'Ctrl+Enter 并行请求多家服务')
    widget.get_by_role('button', name='复制译文 · DeepL', exact=True).click()
    check(page.evaluate('navigator.clipboard.readText()') == widget.locator('[data-provider="deepl"] .m-translation__text').text_content(), '复制单个服务译文，保留原文末尾换行')
    page.wait_for_timeout(400)
    saved = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    check('dummy-' not in json.dumps(saved) and 'IME sentence' not in json.dumps(saved), '配置与同步数据不含密钥、原文或译文')
    # Exercise the actual export path.
    page.locator('.m-search input').first.press('Escape')
    page.evaluate('document.querySelector(".m-translation").scrollIntoView()')
    page.get_by_role('button', name='打开设置', exact=True).click()
    page.get_by_role('button', name='数据', exact=True).click()
    with page.expect_download() as download:
        page.get_by_role('button', name='导出数据', exact=True).click()
    exported = Path(download.value.path()).read_text()
    check('dummy-deepl-key' not in exported and 'IME sentence' not in exported, '普通 JSON 导出排除本机凭据与翻译内容')
    page.locator('.m-drawer').get_by_role('button', name='关闭', exact=True).click()

    page.evaluate('trDeny=true')
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget.locator('[data-provider="microsoft"]')).to_contain_text('密钥被服务拒绝')
    expect(widget.locator('[data-provider="deepl"]')).to_contain_text('你好，世界')
    check(True, '一家服务失败仍保留其他译文')
    source = 'feat: add translation widget and related functionality\n\n' + '\n'.join('- Implemented change ' + str(i) for i in range(7))
    widget.get_by_label('要翻译的文字', exact=True).fill(source)
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget.locator('[data-provider="deepl"]')).to_contain_text('- 你好，世界')
    text = widget.locator('[data-provider="deepl"] .m-translation__text').text_content() if widget.locator('[data-provider="deepl"] .m-translation__text').count() else widget.locator('[data-provider="deepl"] p').last.text_content()
    check(len(text.split('\n')) == 9 and text.split('\n')[1] == '' and len([line for line in text.split('\n') if line.startswith('- ')]) == 7, '翻译保留标题、空行与七条列表')
    widget.get_by_role('button', name='复制译文 · DeepL', exact=True).click()
    check(page.evaluate('navigator.clipboard.readText()') == text, '复制译文保留多行格式')
    page.evaluate('trHold=true')
    widget.get_by_label('要翻译的文字', exact=True).fill('Cancellation test')
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget.get_by_role('button', name='取消', exact=True)).to_be_visible()
    page.wait_for_timeout(100)
    widget.get_by_role('button', name='取消', exact=True).click()
    expect(widget).to_contain_text('已取消')
    check(page.evaluate('trAborts') == 2, '手动取消中止所有服务')
    page.evaluate('trHold=false;trDeny=false')

    widget.get_by_role('button', name='组件设置', exact=True).click()
    settings.get_by_label('大模型', exact=True).check()
    settings.get_by_label('Base URL', exact=True).fill('https://model.example/v1')
    settings.get_by_label('模型', exact=True).fill('test-model')
    settings.get_by_label('API Key / Secret', exact=True).fill('dummy-model-key')
    settings.get_by_label('模型', exact=True).press('Enter')
    expect(settings).not_to_be_visible()
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget).to_contain_text('大模型译文')
    check(widget.locator('.m-translation__result').count() == 1, '大模型独立显示，不请求普通服务')
    check(widget.locator('.m-translation__result img').count() == 0 and page.evaluate('window.trXss') is None, '译文按纯文本展示，不执行 HTML')
    page.screenshot(path='artifacts/translation-dark.png', full_page=True)

    # A synced or imported model URL must not silently reuse a key saved for another endpoint.
    page.wait_for_timeout(300)
    page.evaluate('()=>{const d=JSON.parse(localStorage.getItem("myriad.data"));d.items["tr-test"].config.baseUrl="https://other-model.example/v1";localStorage.setItem("myriad.data",JSON.stringify(d))}')
    page.reload()
    expect(widget).to_be_visible()
    widget.get_by_label('要翻译的文字', exact=True).fill('Endpoint test')
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget).to_contain_text('请在组件设置中填写本机密钥')
    check(page.evaluate('trRequests.length') == 0, '地址改变后不把原密钥发给其他模型服务')

    # Search creates no duplicate widget and retains no translation text in search history.
    page.evaluate('seed=>{const s=JSON.parse(localStorage.getItem("myriad.settings"))||seed;s.search.defaultEngine="google-translate";s.search.keepHistory=true;const e=s.search.engines.find(e=>e.id==="google-translate");if(e)e.enabled=true;else s.search.engines.push({id:"google-translate",enabled:true,prefix:"tr"});localStorage.setItem("myriad.settings",JSON.stringify(s))}', json.loads(exported)['settings'])
    page.reload()
    search = page.locator('.m-search input').first
    search.fill('Private search text')
    search.press('Enter')
    expect(widget.get_by_label('要翻译的文字', exact=True)).to_have_value('Private search text')
    check(page.locator('.m-translation').count() == 1 and page.evaluate('trRequests.length') == 0, '搜索翻译复用组件，仅填写原文')
    page.wait_for_timeout(400)
    check('Private search text' not in page.evaluate('localStorage.getItem("myriad.local")'), '搜索翻译不写搜索历史')

    # Use all official adapters, then cancel on group and tab visibility changes.
    page.evaluate('()=>{const d=JSON.parse(localStorage.getItem("myriad.data"));d.items["tr-test"].config={services:["baidu","youdao","tencent","deepl","microsoft"]};localStorage.setItem("myriad.data",JSON.stringify(d));const k={};for(const p of ["baidu","youdao","tencent","deepl","microsoft"])k[p]={id:"dummy-id",key:"dummy-key"};localStorage.setItem("myriad.translation.credentials.tr-test",JSON.stringify(k))}')
    page.reload()
    widget.get_by_label('要翻译的文字', exact=True).fill('All providers')
    widget.get_by_role('button', name='翻译', exact=True).click()
    expect(widget.locator('[data-status="done"]')).to_have_count(5)
    check(True, '五家官方本机服务均可生成请求并解析结果')
    page.evaluate('trHold=true')
    widget.get_by_role('button', name='翻译', exact=True).click()
    page.wait_for_timeout(100)
    page.locator('.m-groups__tab').nth(1).click()
    page.wait_for_timeout(300)
    check(page.evaluate('trAborts') == 5, '切换分组取消请求')
    page.locator('.m-groups__tab').first.click()
    expect(widget).to_be_visible()
    page.wait_for_timeout(300)
    check(page.evaluate('trRequests.length') == 10, '返回分组不自动重发原文')
    widget.get_by_label('要翻译的文字', exact=True).fill('Background cancellation')
    widget.get_by_role('button', name='翻译', exact=True).click()
    page.wait_for_timeout(100)
    page.evaluate('Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"))')
    page.wait_for_timeout(100)
    check(page.evaluate('trAborts') == 10, '标签页后台取消请求')
    page.evaluate('Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));trHold=false')
    page.emulate_media(color_scheme='light')
    page.screenshot(path='artifacts/translation-light.png', full_page=True)
    browser.close()

print('\n'.join(errors) if errors else 'ALL OK')
raise SystemExit(1 if errors else 0)
