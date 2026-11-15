"""M4 browser regression. MYRIAD_OFFLINE=1 serves built assets through Playwright interception."""
import os, json, mimetypes
from pathlib import Path
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
OFFLINE = os.environ.get('MYRIAD_OFFLINE') == '1'
if OFFLINE: URL = 'https://myriad.test'
checks, errors = [], []
def check(condition, message):
    print(('PASS ' if condition else 'FAIL ') + message, flush=True)
    checks.append(message)
    if not condition: errors.append(message)

MOCK = r"""(() => {
window.m4requests=[];window.m4aborts=0;window.m4hold=false;window.m4fail=false;
const real=window.fetch.bind(window);
window.fetch=async function(input,init={}) {
 const u=new URL(String(input),location.href);
 if(!/worker.example|registry.npmjs.org|api.github.com/.test(u.host))return real(input,init);
 const auth=new Headers(init.headers).get('Authorization');
 window.m4requests.push({path:u.pathname,source:u.searchParams.get('source'),page:u.searchParams.get('page'),q:u.searchParams.get('q'),auth});
 const hold=window.m4hold&&(u.pathname.includes('search')||u.pathname.endsWith('summary'));
 if(hold)await new Promise((resolve,reject)=>{const abort=()=>{window.m4aborts++;reject(new DOMException('Cancelled','AbortError'))};if(init.signal?.aborted)abort();else init.signal?.addEventListener('abort',abort,{once:true})});
 if(u.pathname.endsWith('/health')||u.pathname.endsWith('/me'))return Response.json({identity:'owner',features:{sync:true,feeds:true,search:true,summary:true,credentials:true}});
 if(u.pathname.includes('/sync'))return Response.json({seq:0,update:null,full:false});
 if(u.pathname.endsWith('/credentials'))return Response.json({enabled:true,services:Object.fromEntries(['qweather','github','unsplash','deepl','baidu','youdao','tencent','microsoft','openai','brave','google'].map(service=>[service,{configured:false,fields:[],version:'',source:'none',locked:false}]))});
 if(u.pathname.endsWith('/hot')||u.pathname.endsWith('/rss')){
  if(window.m4fail)return Response.json({error:'blocked'},{status:502});
  const title=u.pathname.endsWith('/rss')?'订阅文章':'热榜文章';
  return Response.json({title:'Test',fetchedAt:Date.now(),items:Array.from({length:15},(_,i)=>({id:'https://example.com/post-'+i,title:title+' '+i,url:'https://example.com/post-'+i,source:u.searchParams.get('source')||'RSS',description:i===0?'<img src=x onerror=window.m4xss=1>':'文章摘要',heat:String(100-i)}))});
 }
 if(u.pathname.endsWith('/reader'))return Response.json({title:'正文',url:u.searchParams.get('url'),description:'文章摘要',paragraphs:Array.from({length:30},(_,i)=>'安全正文 '+i+'，正文仅作为文字显示。')});
 if(u.pathname.endsWith('/summary'))return Response.json({summary:'测试 AI 摘要'});
 if(u.pathname==='/search/repositories')return Response.json({total_count:1,items:[{full_name:'GitHub result',html_url:'https://example.com/shared#github',description:'公共仓库'}]});
 if(u.pathname==='/-/v1/search')return Response.json({total:1,objects:[{package:{name:'npm result',links:{npm:'https://example.com/shared?utm_source=npm'},description:'<img src=x onerror=window.m4xss=1>安全摘要'}}]});
 if(u.pathname.endsWith('/search')){
  const page=Number(u.searchParams.get('page')||0),engine=u.searchParams.get('engine');
  return Response.json({provider:'brave',items:Array.from({length:12},(_,i)=>({title:(page?'后续结果 ':'搜索结果 ')+i,url:i===0&&!page?'https://example.com/shared?utm_source=bing':'https://example.com/result-'+page+'-'+i,description:'结果摘要 '.repeat(i%4+1),engines:[engine]})),next:page===0?1:null});
 }
 return Response.json({});
};
})()"""

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('MYRIAD_BROWSER','/usr/bin/google-chrome'),headless=True)
    context=browser.new_context(viewport={'width':1500,'height':1050},locale='zh-CN',timezone_id='Asia/Shanghai')
    if OFFLINE:
        dist=Path(__file__).resolve().parents[1]/'apps/playground/dist'
        def route(r):
            parsed=urlparse(r.request.url)
            file=dist/(unquote(parsed.path).lstrip('/') or 'index.html')
            if parsed.hostname=='myriad.test' and file.is_file():
                r.fulfill(status=200,body=file.read_bytes(),content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
            else: r.fulfill(status=204,body='')
        context.route('**/*',route)
    context.add_init_script(MOCK)
    page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_timeout(300)
    data=page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    widgets={
        'feed-a':{'id':'feed-a','type':'widget','kind':'feeds','size':'2x4','config':{'sources':['v2ex','github'],'readMarks':True}},
        'feed-b':{'id':'feed-b','type':'widget','kind':'feeds','size':'2x4','config':{'sources':['v2ex'],'readMarks':True}},
        'feed-rss':{'id':'feed-rss','type':'widget','kind':'feeds','size':'2x4','config':{'mode':'rss','subscriptions':[{'id':'rss1','title':'RSS 测试','url':'https://example.com/feed.xml','rsshub':False}]}},
    }
    data['items'].update(widgets);data['groups'][0]['items']=['feed-a','feed-b'];data['groups'][1]['items']=['feed-rss']
    page.evaluate('''d=>{localStorage.setItem('myriad.data',JSON.stringify(d));const l=JSON.parse(localStorage.getItem('myriad.local'));l.activeGroup=d.groups[0].id;l.sync={...l.sync,enabled:true,apiBase:'https://worker.example',authMode:'token',token:'test-connection'};localStorage.setItem('myriad.local',JSON.stringify(l));const s=JSON.parse(localStorage.getItem('myriad.settings'))||{schema:1,search:{}};s.search.aggregate={enabled:true,engines:['bing','npm','github'],routes:{bing:'worker'}};localStorage.setItem('myriad.settings',JSON.stringify(s))}''',data)
    page.reload();feed=page.locator('[data-widget="feeds"]').first
    expect(feed).to_contain_text('热榜文章 0')
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("hot")&&r.source==="v2ex").length')==1,'两个可见实例共享每日缓存')
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("rss")).length')==0,'隐藏分组不获取 RSS')
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("summary")).length')==0,'打开预览前不生成 AI 摘要')
    feed.get_by_role('button',name='刷新信息流（遵守每日缓存）').click()
    page.wait_for_timeout(100)
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("hot")&&r.source==="v2ex").length')==1,'手动刷新遵守每日缓存')
    feed.locator('.m-feed__title').first.click()
    dialog=page.locator('dialog[open]');expect(dialog).to_contain_text('测试 AI 摘要')
    check(dialog.locator('img,script').count()==0 and page.evaluate('window.m4xss') is None,'阅读预览把上游内容当作文字展示')
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("summary")).every(r=>r.auth==="Bearer test-connection")'),'AI 摘要只走鉴权路径')
    dialog.get_by_role('button',name='收藏条目',exact=True).click();dialog.get_by_role('button',name='关闭',exact=True).click()
    check(feed.locator('li.is-read').count()==1,'可选已读标记记录点击')
    check(feed.get_by_role('button',name='取消收藏').count()==1,'收藏反映在组件中')
    feed.locator('select').select_option('github');expect(feed).to_contain_text('热榜文章 0')
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("hot")&&r.source==="github").length')==1,'切换来源只获取所选榜单')
    feed.get_by_role('button',name='小组件设置').click() if feed.get_by_role('button',name='小组件设置').count() else feed.locator('.m-widget-head__actions button').last.click()
    settings=page.locator('.m-feed-settings');settings.locator('select').first.select_option('rss')
    settings.get_by_role('button',name='添加订阅').click();settings.get_by_label('订阅名称',exact=True).fill('新订阅')
    settings.locator('fieldset input[type="url"]').fill('https://example.com/feed.xml')
    page.locator('dialog[open]').get_by_role('button',name='保存',exact=True).click()
    expect(feed).to_contain_text('订阅文章 0')
    page.wait_for_function('JSON.parse(localStorage.getItem("myriad.data")).items["feed-a"].config.subscriptions?.length===1')
    check(page.evaluate('JSON.parse(localStorage.getItem("myriad.data")).items["feed-a"].config.subscriptions.length')==1,'RSS 订阅通过原生表单保存')
    # The result page keeps independent engine state and deduplicates canonical URLs.
    page.locator('.m-search__input').fill('test query');page.locator('.m-search__input').press('Enter')
    results=page.locator('.m-results');expect(results).to_contain_text('搜索结果 1')
    check(results.locator('.m-results__card').count()>=12,'聚合搜索显示结果卡片')
    check(results.locator('.m-results__card').filter(has_text='npm · GitHub').count()==1,'多个引擎的重复链接合并来源')
    check(results.locator('.m-results__new').count()==results.locator('.m-results__card').count(),'当前页打开时标题右端提供新标签页链接')
    check(page.evaluate('m4requests.filter(r=>r.path.endsWith("/me/search")).every(r=>r.auth==="Bearer test-connection")'),'通用网页 API 回退仅使用鉴权路径')
    results.get_by_role('button',name='npm 1',exact=True).click();check(results.locator('.m-results__card').count()==1,'可以按引擎查看结果')
    results.get_by_role('button',name='全部',exact=True).click();page.locator('.m-results__more').scroll_into_view_if_needed()
    expect(results).to_contain_text('后续结果 1')
    check(page.evaluate('m4requests.some(r=>r.path.endsWith("/me/search")&&r.page==="1")'),'滚动到末尾继续加载下一批')
    page.screenshot(path='artifacts/m4-search.png',full_page=True)
    # Cancel on background and on a newer query.
    page.evaluate('window.m4hold=true');page.locator('.m-search__input').fill('pending');page.locator('.m-search__input').press('Enter');page.wait_for_timeout(100)
    page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(100);check(page.evaluate('m4aborts')>0,'切到后台取消搜索请求')
    page.evaluate("window.m4hold=false;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
    expect(results).to_contain_text('搜索结果 1')
    results.get_by_role('button',name='返回',exact=True).click();expect(feed).to_be_visible()
    check('search?' not in page.url,'返回恢复导航页面')
    page.screenshot(path='artifacts/m4-feeds.png',full_page=True)
    page.keyboard.press('Alt+,');page.locator('.m-drawer__nav button').filter(has_text='搜索').click()
    check(page.locator('.m-aggregate-settings__row').count()==11,'搜索设置提供每个引擎的获取方式')
    page.locator('.m-drawer__nav button').filter(has_text='服务密钥').click()
    page.wait_for_timeout(500)
    check(page.locator('.m-service-credentials').inner_text().find('Brave')>=0 and 'Google' in page.locator('.m-service-credentials').inner_text(),'搜索 API 密钥复用加密配置入口')
    browser.close()

if errors: print('FAILED',json.dumps(errors,ensure_ascii=False));raise SystemExit(1)
print(f'ALL OK ({len(checks)} checks)')
