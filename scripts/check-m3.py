"""M3 final widgets in isolated browser storage, with fixed public/private upstream mocks."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
errors = []
def check(value, text):
    print(('PASS ' if value else 'FAIL ') + text, flush=True)
    if not value: errors.append(text)

MOCK = r"""(() => {
const real = window.fetch; window.m3requests=[]; window.m3hold=false; window.m3aborts=0; window.m3noToken=false;
window.m3notices=[];window.m3permission='default';window.m3permissionRequests=0;
window.Notification=class {
 static get permission(){return window.m3permission}
 static async requestPermission(){window.m3permissionRequests++;return window.m3permission='granted'}
 constructor(title,options){window.m3notices.push({title,...options})}
};
window.fetch = async (url, init={}) => {
 const u = new URL(String(url),location.href);
 if(!/worker.example|api.github.com|cdn.jsdelivr.net|raw.githubusercontent.com/.test(u.host)) return real(url,init);
 window.m3requests.push({path:u.pathname,section:u.searchParams.get('section'),auth:new Headers(init.headers).get('Authorization')});
 if(window.m3hold && u.pathname.includes('github')) await new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{window.m3aborts++;reject(new DOMException('Cancelled','AbortError'))},{once:true}));
 if(u.pathname.endsWith('/health') || u.pathname.endsWith('/me'))return Response.json({ok:true,identity:'mock-owner',features:{sync:false,github:true,githubPrivate:!window.m3noToken,qweather:true}});
 if(u.pathname.includes('/sync'))return Response.json({error:'disabled'},{status:501});
 if(u.pathname.includes('/holidays/'))return Response.json({days:[{date:'2026-12-25',name:'测试假期',isOffDay:true},{date:'2026-12-26',name:'测试假期',isOffDay:true},{date:'2027-01-02',name:'调休',isOffDay:false}]});
 if(u.pathname.endsWith('/weather'))return Response.json({provider:'qweather',condition:'晴',current:{temperature_2m:22,apparent_temperature:20,weather_code:0,is_day:1,time:'2026-11-14T12:00'},hourly:{time:['2026-11-14T13:00'],temperature_2m:[24],weather_code:[0]},daily:{time:['2026-11-14'],temperature_2m_min:[14],temperature_2m_max:[25],weather_code:[0],sunrise:['2026-11-14T06:30'],sunset:['2026-11-14T17:30']},aqi:32,warnings:[{id:'alert-1',title:'暴雨预警',text:'请注意安全\n避免进入低洼地区',severity:'severe'}]});
 if(u.pathname.endsWith('/github')) {
  if(u.pathname.includes('/me/') && window.m3noToken)return Response.json({error:'github-disabled'},{status:501});
  const section=u.searchParams.get('section'), data={section,personal:u.pathname.includes('/me/')};
  if(section==='repositories')data.repos=[{name:'test/priority',url:'https://github.com/test/priority',description:'优先仓库',stars:7,forks:3,issues:2},{name:'test/other',url:'https://github.com/test/other',description:'<img src=x onerror=window.m3xss=1>',stars:1,forks:0,issues:0}];
  if(section==='contributions')data.days=[{date:'2026-11-13',count:window.m3unknown?null:3,level:1},{date:'2026-11-14',count:8,level:4}];
  if(section==='contributions' && window.m3full)data.days=Array.from({length:371},(_,i)=>({date:new Date(Date.UTC(2026,10,15)-(370-i)*86400000).toISOString().slice(0,10),count:i%6,level:Math.min(4,i%6)}));
  if(section==='tasks')data.tasks=[{id:'task',title:'请审阅测试 PR',url:'https://github.com/test/priority/pull/1',kind:'pr',reason:'review'}];
  if(section==='notifications')data.notifications=[{id:'notice',title:'私有通知测试',url:'https://github.com/notifications',repository:'test/priority'}];
  if(section==='actions')data.actions=[{id:'run',title:'CI tests',url:'https://github.com/test/priority/actions/runs/1',repository:'test/priority',status:'success'}];
  if(section==='releases')data.releases=[{id:'release',title:'v1.0.0',url:'https://github.com/test/priority/releases',repository:'test/priority',status:'v1.0.0'}];
  if(section==='activity')data.activity=[{id:'event',actor:'friend',kind:'WatchEvent',repository:'test/priority',url:'https://github.com/test/priority'}];
  return Response.json(data);
 }
 return Response.json({});
};
})()"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    context = browser.new_context(viewport={'width':1600,'height':1100}, locale='zh-CN', timezone_id='Asia/Shanghai')
    context.add_init_script(MOCK)
    page = context.new_page()
    page.clock.install(time=datetime(2026,11,15,0,0,tzinfo=timezone.utc))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_timeout(400)
    data = page.evaluate('JSON.parse(localStorage.getItem("myriad.data"))')
    widgets = {
        'gh-test': {'id':'gh-test','type':'widget','kind':'github','size':'4x4','config':{'repos':['test/priority']}},
        'cd-test': {'id':'cd-test','type':'widget','kind':'countdown','size':'2x2','config':{'calendar':'lunar','lunarYear':2025,'lunarMonth':1,'lunarDay':1,'title':'农历纪念日'}},
        'we-test': {'id':'we-test','type':'widget','kind':'weather','size':'4x4','config':{'cities':[{'name':'北京','latitude':39.9,'longitude':116.4}]}},
    }
    data['items'].update(widgets)
    data['groups'][0]['items']=['gh-test','cd-test']
    data['groups'][1]['items']=['we-test']
    page.evaluate('d=>{localStorage.setItem("myriad.data",JSON.stringify(d));const l=JSON.parse(localStorage.getItem("myriad.local"));l.activeGroup=d.groups[0].id;l.sync={...l.sync,enabled:true,apiBase:"https://worker.example",authMode:"token",token:"dummy-connection"};localStorage.setItem("myriad.local",JSON.stringify(l))}', data)
    page.reload()
    gh = page.locator('[data-widget="github"]')
    expect(gh).to_contain_text('test/priority')
    check(gh.locator('.m-github__list a').first.text_content().strip()=='test/priority','关注仓库在列表前面')
    check(gh.locator('img').count()==0 and page.evaluate('window.m3xss') is None,'GitHub 上游内容按纯文本展示')
    check(page.evaluate('m3requests.filter(r=>r.path.includes("/me/github")).every(r=>r.auth==="Bearer dummy-connection")'),'私有请求携带同步鉴权')
    for section,text in [('contributions','11 次贡献'),('tasks','请审阅测试 PR'),('notifications','私有通知测试'),('actions','CI tests'),('releases','v1.0.0'),('activity','friend')]:
        gh.locator('select').select_option(section)
        expect(gh).to_contain_text(text)
        check(True,'GitHub '+section+' 正常显示')
        if section=='contributions':
            gh.get_by_text('逐日贡献数据',exact=True).click()
            expect(gh.get_by_role('table')).to_be_visible()
            check(gh.get_by_role('table').locator('tbody tr').count()==2,'贡献图提供逐日表格替代')
    check(page.evaluate('Object.keys(localStorage).filter(k=>k.includes("cache.widget.github")).length')==0,'私有 GitHub 结果不写持久缓存')
    check('私有通知测试' not in page.evaluate('localStorage.getItem("myriad.data")'),'私有结果不进入同步数据')
    gh.get_by_role('button',name='组件设置',exact=True).click()
    dialog=page.get_by_role('dialog',name='GitHub · 组件设置',exact=True)
    dialog.get_by_label('个人账号',exact=True).fill('bad/owner')
    dialog.get_by_role('button',name='保存',exact=True).click()
    expect(dialog).to_be_visible()
    check(True,'无效 GitHub 账号由原生表单阻止保存')
    dialog.get_by_label('个人账号',exact=True).fill('zxaBinbina')
    dialog.get_by_label('个人账号',exact=True).press('Enter')
    expect(dialog).not_to_be_visible()
    check(True,'GitHub 设置支持回车保存')
    cd=page.locator('[data-widget="countdown"]')
    expect(cd).to_contain_text('2027-02-06')
    check(True,'农历周年按历法切换到下一年春节')
    cd.get_by_role('button',name='组件设置',exact=True).click()
    dialog=page.get_by_role('dialog',name='倒数日 · 组件设置',exact=True)
    expect(dialog).to_be_visible()
    dialog.get_by_label('日期类型',exact=True).select_option('holiday')
    dialog.get_by_role('button',name='保存',exact=True).click()
    expect(cd).to_contain_text('测试假期')
    expect(cd).to_contain_text('2026-12-25')
    check(True,'倒数日获取已公布法定假期，排除连续假期与调休')
    before=page.evaluate('m3requests.filter(r=>r.path.endsWith("/weather")).length')
    check(before==0,'非当前分组天气不请求')
    page.locator('.m-search input').press('Escape')
    page.keyboard.press('Alt+2')
    we=page.locator('[data-widget="weather"]')
    expect(we).to_contain_text('22')
    expect(we).to_contain_text('暴雨预警')
    we.get_by_text('暴雨预警',exact=True).click()
    expect(we).to_contain_text('避免进入低洼地区')
    check(we.locator('.m-weather__credit').text_content().strip().endswith('QWeather'),'和风天气标注来源并展示可展开预警')
    we.get_by_role('button',name='组件设置',exact=True).click()
    dialog=page.get_by_role('dialog',name='天气 · 组件设置',exact=True)
    dialog.get_by_label('天气预警',exact=True).uncheck()
    dialog.get_by_role('button',name='保存',exact=True).click()
    expect(we.locator('.m-weather__warnings')).to_have_count(0)
    check(True,'预警可在设置关闭')
    page.keyboard.press('Alt+1')
    expect(gh).to_be_visible()
    expect(gh).to_contain_text('test/priority')
    expect(gh.get_by_role('button',name='刷新 GitHub',exact=True)).to_be_enabled()
    page.evaluate('m3hold=true')
    gh.get_by_role('button',name='刷新 GitHub',exact=True).click()
    page.wait_for_timeout(200)
    page.keyboard.press('Alt+2')
    page.wait_for_timeout(350)
    check(page.evaluate('m3aborts')>=1,'切换分组取消 GitHub 请求并阻止晚到结果')
    page.evaluate('m3hold=false')
    page.keyboard.press('Alt+1')
    expect(gh).to_be_visible()
    gh.locator('select').select_option('contributions')
    expect(gh).to_contain_text('11 次贡献')
    page.evaluate('m3unknown=true')
    expect(gh.get_by_role('button',name='刷新 GitHub',exact=True)).to_be_enabled()
    gh.get_by_role('button',name='刷新 GitHub',exact=True).click()
    expect(gh).to_contain_text('部分次数未知')
    check(True,'贡献次数缺失时不显示不完整的总数')
    page.evaluate('m3full=true')
    gh.get_by_role('button',name='刷新 GitHub',exact=True).click()
    expect(gh.locator('.m-github__heatmap [data-level]')).to_have_count(371)
    check(gh.locator('.m-github__heatmap').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),'宽卡片完整显示一年贡献图')
    Path('artifacts').mkdir(exist_ok=True)
    page.keyboard.press('Alt+,')
    page.locator('.m-drawer .m-seg__item',has_text='深色').click()
    page.keyboard.press('Escape')
    expect(page.locator('.myriad')).to_have_attribute('data-theme','dark')
    page.wait_for_timeout(700)
    page.screenshot(path='artifacts/m3-complete-dark.png',full_page=True)
    page.keyboard.press('Alt+,')
    page.locator('.m-drawer .m-seg__item',has_text='浅色').click()
    page.keyboard.press('Escape')
    expect(page.locator('.myriad')).to_have_attribute('data-theme','light')
    page.wait_for_timeout(700)
    page.screenshot(path='artifacts/m3-complete-light.png',full_page=True)
    check(page.evaluate('m3permissionRequests')==0,'事件通知权限只在主动启用时申请')
    cd.get_by_role('button',name='组件设置',exact=True).click()
    dialog=page.get_by_role('dialog',name='倒数日 · 组件设置',exact=True)
    dialog.get_by_label('日期类型',exact=True).select_option('solar')
    dialog.get_by_label('事件名称',exact=True).fill('独立事件提醒')
    dialog.get_by_label('起始日期',exact=True).fill('2026-11-15')
    dialog.get_by_label('循环',exact=True).select_option('none')
    dialog.get_by_label('当天提醒',exact=True).check()
    dialog.get_by_label('提醒时间',exact=True).fill('08:01')
    dialog.get_by_role('button',name='允许通知提醒',exact=True).click()
    dialog.get_by_role('button',name='保存',exact=True).click()
    expect(cd).to_have_class('m-countdown is-today')
    page.clock.fast_forward(61000)
    page.wait_for_timeout(300)
    check(page.evaluate('m3notices.filter(n=>n.title==="独立事件提醒").length')==1,'独立倒数日事件按主时钟时区通知一次')
    cd.get_by_role('button',name='组件设置',exact=True).click()
    dialog=page.get_by_role('dialog',name='倒数日 · 组件设置',exact=True)
    dialog.get_by_label('当天提醒',exact=True).uncheck()
    dialog.get_by_role('button',name='保存',exact=True).click()
    page.clock.fast_forward(120000)
    check(page.evaluate('m3notices.filter(n=>n.title==="独立事件提醒").length')==1,'关闭事件提醒后不会重复通知')
    check(not errors,'浏览器没有未处理异常')
    browser.close()
if errors: raise SystemExit('\n'.join(errors))
