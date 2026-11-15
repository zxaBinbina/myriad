"""M4 trial feedback: persistent source, hover reading, media and native form validation.
Uses an isolated browser context and fixed network data; never writes user storage.
"""
import ast, io, json, mimetypes, os, subprocess, tempfile, wave
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
mock = next(n.value.value for n in ast.parse((ROOT/'scripts/check-m4.py').read_text()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='MOCK' for t in n.targets))
mock = mock.replace("q:u.searchParams.get('q'),auth", "q:u.searchParams.get('q'),target:u.searchParams.get('url'),auth")
mock = mock.replace("u.pathname.endsWith('summary'))", "u.pathname.endsWith('summary')||u.pathname.endsWith('reader'))")
mock = mock.replace("url:'https://example.com/post-'+i", "url:u.searchParams.get('source')==='bilibili'?'https://www.bilibili.com/video/BV'+i:(i===14?'https://youtu.be/test':'https://example.com/post-'+i)")
old = "if(u.pathname.endsWith('/reader'))return Response.json({title:'正文',url:u.searchParams.get('url'),description:'文章摘要',paragraphs:Array.from({length:30},(_,i)=>'安全正文 '+i+'，正文仅作为文字显示。')});"
new = """if(u.pathname.endsWith('/reader'))return Response.json({title:'正文',url:u.searchParams.get('url'),description:'文章摘要',paragraphs:['兼容旧正文'],blocks:[
 {type:'text',text:'正文开头'},
 {type:'image',url:'https://media.test/photo.svg',alt:'文章图片'},
 {type:'image',url:'https://media.test/missing.jpg',alt:'失效图片'},
 {type:'video',url:'https://media.test/movie.webm',poster:'https://media.test/photo.svg',label:'文章视频'},
 {type:'audio',url:'https://media.test/sound.wav',label:'文章音频'},
 {type:'video',url:'https://media.test/missing.webm',label:'失效视频'},
 {type:'audio',url:'https://media.test/missing.wav',label:'失效音频'},
 {type:'unavailable',label:'第三方播放器',url:'https://video.example/embed'},
 ...Array.from({length:35},(_,i)=>({type:'text',text:'安全长正文 '+i+'，保留文字与媒体顺序。'.repeat(3)}))]});"""
assert old in mock
mock = mock.replace(old,new)
checks=[]; errors=[]
def check(value,message):
 print(('PASS ' if value else 'FAIL ')+message,flush=True);checks.append(message)
 if not value: raise AssertionError(message)
svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" fill="#2468b1"/><text x="30" y="68" font-size="24" fill="white">Article image</text></svg>'
audio=io.BytesIO()
with wave.open(audio,'wb') as w: w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b'\0\0'*8000)
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
 video=Path(tmp)/'movie.webm'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=320x180:d=1','-c:v','libvpx-vp9','-an',str(video)],check=True)
 browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True)
 context=browser.new_context(viewport={'width':1500,'height':1050},locale='zh-CN',timezone_id='Asia/Shanghai')
 def route(r):
  u=urlparse(r.request.url);f=ROOT/'apps/playground/dist'/(unquote(u.path).lstrip('/') or 'index.html')
  if u.hostname=='myriad.test' and f.is_file(): r.fulfill(status=200,body=f.read_bytes(),content_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
  elif u.hostname=='media.test' and u.path=='/photo.svg': r.fulfill(status=200,body=svg,content_type='image/svg+xml')
  elif u.hostname=='media.test' and u.path=='/movie.webm': r.fulfill(status=200,body=video.read_bytes(),content_type='video/webm')
  elif u.hostname=='media.test' and u.path=='/sound.wav': r.fulfill(status=200,body=audio.getvalue(),content_type='audio/wav')
  else:r.fulfill(status=404,body='Unavailable')
 context.route('**/*',route);context.add_init_script(mock)
 page=context.new_page();page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGEERROR',str(e),flush=True)));page.on('console',lambda msg:errors.append(msg.text) if 'Pattern attribute' in msg.text else None)
 page.goto('https://myriad.test');page.locator('.m-onb__option').first.click();page.wait_for_timeout(350)
 data=page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
 data['items'].update({
  'feed-a':{'id':'feed-a','type':'widget','kind':'feeds','size':'2x4','config':{'sources':['v2ex','hackernews','bilibili'],'readMarks':True}},
  'feed-b':{'id':'feed-b','type':'widget','kind':'feeds','size':'2x4','config':{'sources':['v2ex','hackernews'],'readMarks':True}},
  'feed-rss':{'id':'feed-rss','type':'widget','kind':'feeds','size':'2x4','config':{'mode':'rss','subscriptions':[{'id':'r1','title':'RSS One','url':'https://example.com/1.xml'}, {'id':'r2','title':'RSS Two','url':'https://example.com/2.xml'}]}},
  'gh':{'id':'gh','type':'widget','kind':'github','size':'4x4','config':{'sections':['repositories'],'repos':[]}},
 })
 data['groups'][0]['items']=['feed-a','feed-b'];data['groups'][1]['items']=['feed-rss','gh']
 page.evaluate('''d=>{localStorage.setItem('myriad.data',JSON.stringify(d));const l=JSON.parse(localStorage.getItem('myriad.local'));l.activeGroup=d.groups[0].id;l.sync={...l.sync,enabled:true,apiBase:'https://worker.example',authMode:'token',token:'test-connection'};localStorage.setItem('myriad.local',JSON.stringify(l))}''',data)
 page.reload();feeds=page.locator('[data-widget="feeds"]');a=feeds.nth(0);b=feeds.nth(1)
 expect(a).to_contain_text('热榜文章 0');a.locator('select').select_option('hackernews');page.wait_for_function('JSON.parse(localStorage.getItem("myriad.data")).items["feed-a"].config.selectedSource==="hackernews"')
 page.reload();expect(a.locator('select')).to_have_value('hackernews');expect(b.locator('select')).to_have_value('v2ex')
 check(True,'每个热榜实例独立保存平台并在重载后恢复')
 first=a.locator('.m-feed__title').first;first.hover();page.wait_for_timeout(150)
 check(page.locator('.m-feed-hover:popover-open').count()==0,'短暂经过条目不打开气泡')
 card=page.locator('.m-feed-hover:popover-open');expect(card).to_contain_text('正文开头')
 check(page.locator('dialog[open]').count()==0 and a.locator('.is-read').count()==0,'悬浮阅读不打开点击弹窗、不标记已读')
 scroll=card.locator('.m-feed-hover__reading');start=scroll.evaluate('e=>e.scrollTop');page.wait_for_timeout(650)
 check(scroll.evaluate('e=>e.scrollTop')>start,'鼠标停留条目时气泡自动缓慢滚动')
 # Pause by entering, then inspect media in document order.
 card.hover();page.wait_for_timeout(300);start=scroll.evaluate('e=>e.scrollTop');page.wait_for_timeout(400)
 check(abs(scroll.evaluate('e=>e.scrollTop')-start)<2,'移入气泡暂停滚动，气泡保持打开')
 scroll.evaluate('e=>e.scrollTop=0');img=card.get_by_alt_text('文章图片');expect(img).to_be_visible();page.wait_for_function("document.querySelector('.m-feed-hover:popover-open img')?.naturalWidth>0")
 expect(card).to_contain_text('失效图片');check(card.locator('.m-reader-content__placeholder').count()>=2,'有效图片展示、失效图片和嵌入播放器显示占位符')
 check(card.locator('video[controls][preload="none"][width="800"][height="450"]').count()==2 and card.locator('audio[controls][preload="none"]').count()==2,'视频音频保留原生控件、按需加载且不自动播放')
 # Actual playback uses fixed locally generated media.
 video_el=card.locator('video').first;video_el.scroll_into_view_if_needed();video_el.evaluate('async e=>{e.muted=true;await e.play()}')
 check(video_el.evaluate('e=>!e.paused&&e.readyState>=2'),'文章视频可实际播放')
 video_el.evaluate('e=>e.pause()');sound=card.locator('audio').first;sound.scroll_into_view_if_needed();sound.evaluate('async e=>{e.muted=true;await e.play()}');check(sound.evaluate('e=>!e.paused'),'文章音频可实际播放');sound.evaluate('e=>e.pause()')
 for selector,label in [('video','失效视频'),('audio','失效音频')]:
  el=card.locator(selector).last;el.evaluate('e=>{e.load();e.play().catch(()=>{})}');expect(card.locator('.m-reader-content__placeholder').filter(has_text=label)).to_be_visible()
 check(True,'无法播放的视频和音频变为占位符')
 scroll.evaluate('e=>e.scrollTop=0');page.screenshot(path=str(ROOT/'artifacts/m4-hover-media.png'))
 page.mouse.move(20,20);expect(card).to_have_count(0);check(True,'离开条目及气泡后关闭阅读')
 first.focus();expect(card).to_contain_text('正文开头');check(first.evaluate('e=>document.activeElement===e'),'键盘聚焦打开补充预览且不转移焦点')
 first.click();dialog=page.locator('dialog[open]');expect(dialog).to_contain_text('正文开头');check(page.locator('.m-feed-hover:popover-open').count()==0 and a.locator('.is-read').count()==1,'点击条目仍打开原弹窗并关闭气泡、记录已读')
 dialog.locator('video').first.click();check(dialog.is_visible() and page.url=='https://myriad.test/','操作媒体不会触发原文跳转')
 page.screenshot(path=str(ROOT/'artifacts/m4-reader-media.png'));dialog.get_by_role('button',name='关闭',exact=True).click()
 # Exclusion is based on actual URL, even when an entry comes from RSS/HN.
 a.locator('select').select_option('bilibili');first=a.locator('.m-feed__title').first
 before=page.evaluate('m4requests.filter(r=>r.path.endsWith("reader")).length');first.hover();page.wait_for_timeout(800)
 check(page.locator('.m-feed-hover:popover-open').count()==0 and page.evaluate('m4requests.filter(r=>r.path.endsWith("reader")).length')==before,'视频平台无悬浮气泡或正文请求')
 first.click();expect(page.locator('dialog[open]')).to_be_visible();check(True,'视频平台点击弹窗行为保留');page.locator('dialog[open]').get_by_role('button',name='关闭',exact=True).click()
 a.locator('select').select_option('hackernews');page.wait_for_timeout(200)
 first=a.locator('.m-feed__title').first;page.evaluate('window.m4hold=true');first.hover();expect(card).to_contain_text('加载');page.wait_for_timeout(150)
 page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
 check(page.locator('.m-feed-hover:popover-open').count()==0 and page.evaluate('m4aborts')>0,'后台关闭气泡并取消未完成请求')
 page.evaluate("window.m4hold=false;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
 page.locator('.m-groups__tab').nth(1).click();rss=page.locator('[data-widget="feeds"]:visible').last;expect(rss).to_contain_text('订阅文章 0');rss.locator('select').select_option('r2');page.wait_for_function('JSON.parse(localStorage.getItem("myriad.data")).items["feed-rss"].config.selectedSubscription==="r2"');page.reload();expect(rss.locator('select')).to_have_value('r2')
 check(True,'RSS 订阅选择在重载后恢复')
 # Test regex compiled by actual Chrome and native validity, including Enter save.
 page.locator('[data-widget="github"]').locator('.m-widget-head__actions button').last.click();dialog=page.locator('dialog[open]');user=dialog.get_by_label('个人账号',exact=True)
 check(user.evaluate("e=>{new RegExp(e.pattern,'v');return true}"),'Chrome 实际 DOM pattern 可按 v 规则编译')
 user.fill('bad/owner');check(user.evaluate('e=>e.validity.patternMismatch'),'原生 pattern 拒绝带斜杠账号')
 user.fill('valid-owner');check(not user.evaluate('e=>e.validity.patternMismatch'),'原生 pattern 接受含连字符账号');user.press('Enter');expect(dialog).not_to_be_visible()
 page.locator('.m-groups__tab').nth(0).click();expect(a.locator('select')).to_have_value('hackernews');check(True,'切换分组仍恢复对应热榜平台')
 # Settings save must preserve source choice.
 a.locator('.m-widget-head__actions button').last.click();page.locator('dialog[open]').get_by_role('button',name='保存',exact=True).click();expect(a.locator('select')).to_have_value('hackernews');check(True,'保存组件设置保留所选平台')
 browser.close()
if errors:print('ERRORS',json.dumps(errors,ensure_ascii=False));raise SystemExit(1)
print(f'ALL OK ({len(checks)} checks)')
