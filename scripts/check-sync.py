"""在本地 Worker 上验证独立令牌、双设备同步、D1 文件、备份与回滚。

先启动 playground（4180）和 Worker（8799，--local-upstream 127.0.0.1:8799）。
Worker 配置 SYNC_TOKEN_SHA256、DEV_AUTH_BYPASS=false，且 ALLOWED_ORIGINS
包含 http://127.0.0.1:4180。MYRIAD_TOKEN_FILE 指定对应令牌文件。
仅使用本地测试数据库；此脚本在 main 文档中写入测试内容。
"""
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('MYRIAD_URL', 'http://127.0.0.1:4180')
API = os.environ.get('MYRIAD_API_URL', 'http://127.0.0.1:8799')
if urlparse(API).hostname not in ('localhost', '127.0.0.1'):
    raise RuntimeError('This browser test writes test data: use a local Worker only.')
token_path = Path(os.environ.get('MYRIAD_TOKEN_FILE', '../myriad_api/.local/connection-token.txt'))
TOKEN = token_path.read_text().strip()
errors = []

def open_settings(page):
    if not page.locator('.m-drawer').count():
        page.keyboard.press('Alt+,')
    page.locator('.m-drawer__tab', has_text='同步').click()

def start(page, choice):
    page.goto(URL)
    page.locator('.m-onb__option').first.click()
    page.wait_for_selector('.m-grid .m-tile')
    open_settings(page)
    expect(page.get_by_label('认证方式')).to_have_value('token')
    expect(page.get_by_label('连接令牌')).to_have_attribute('type', 'password')
    page.get_by_label('服务地址', exact=True).fill(API)
    page.get_by_label('连接令牌', exact=True).fill(TOKEN)
    page.get_by_role('button', name='连接', exact=True).click()
    page.wait_for_function("document.querySelector('.m-sync-status')?.textContent.includes('已同步') || document.body.textContent.includes('云端已有数据')")
    if page.get_by_text('云端已有数据', exact=True).is_visible():
        page.get_by_text(choice, exact=True).click()
    expect(page.locator('.m-sync-status')).to_contain_text('已同步', timeout=15000)

def set_theme(page, label):
    page.locator('.m-drawer__tab', has_text='外观').click()
    page.locator('.m-drawer .m-seg__item', has_text=label).click()
    page.locator('.m-drawer__tab', has_text='同步').click()
    page.wait_for_timeout(4000)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('MYRIAD_BROWSER', '/usr/bin/google-chrome'), headless=True)
    contexts = [browser.new_context(viewport={'width': 1440, 'height': 1100}, locale='zh-CN', timezone_id='Asia/Shanghai') for _ in range(2)]
    a, b = [context.new_page() for context in contexts]
    for page in (a, b):
        page.on('pageerror', lambda error: errors.append(str(error)))
    # 验证本地测试服务器也没有跳过身份验证。
    assert a.request.get(API + '/v1/me').status == 401
    start(a, '上传本机数据')
    start(b, '使用云端数据')
    print('PASS 两个隔离页面通过连接令牌连接，无 Access / R2')
    expect(a.get_by_text('单个云端文件最多 10 MiB；更大的壁纸仍可在本机使用')).to_be_visible()
    set_theme(a, '浅色')
    b.get_by_role('button', name='立即同步', exact=True).click()
    expect(b.locator('.myriad')).to_have_attribute('data-theme', 'light', timeout=15000)
    print('PASS 设置跨设备同步')
    a.get_by_role('button', name='立即备份', exact=True).click()
    expect(a.locator('.m-backup')).not_to_have_count(0)
    a.screenshot(path='artifacts/token-sync-settings.png')
    set_theme(a, '深色')
    a.locator('.m-backup').first.get_by_role('button', name='回滚', exact=True).click()
    a.locator('dialog[open]').get_by_role('button', name='回滚', exact=True).click()
    expect(a.locator('.myriad')).to_have_attribute('data-theme', 'light', timeout=15000)
    print('PASS D1 手动备份与回滚')
    # 浏览器负责自动设置 Content-Length，与扩展真实上传路径一致。
    result = a.evaluate("""async (base) => {
      const token = JSON.parse(localStorage.getItem('myriad.local')).sync.token;
      const key = 'browser-smoke.' + Date.now();
      const headers = {Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream'};
      const bytes = Uint8Array.from({length: 2100007}, (_, i) => i % 251);
      const put = await fetch(base + '/v1/me/blobs/' + key, {method:'PUT',headers,body:bytes});
      const get = await fetch(base + '/v1/me/blobs/' + key, {headers});
      const received = new Uint8Array(await get.arrayBuffer());
      const equal = received.length === bytes.length && received.every((n,i) => n === bytes[i]);
      const del = await fetch(base + '/v1/me/blobs/' + key, {method:'DELETE',headers});
      return {put:put.status,get:get.status,del:del.status,equal};
    }""", API)
    assert result == {'put': 200, 'get': 200, 'del': 200, 'equal': True}, result
    print('PASS 大于 2MB 的文件在 D1 中分块上传、下载与删除')
    a.reload()
    a.wait_for_selector('.m-grid .m-tile')
    open_settings(a)
    expect(a.locator('.m-sync-status')).to_contain_text('已同步', timeout=15000)
    expect(a.get_by_label('认证方式')).to_have_value('token')
    assert a.get_by_label('连接令牌', exact=True).input_value() == TOKEN
    print('PASS 刷新后连接令牌持久化并自动恢复同步')
    for context in contexts:
        context.close()
    browser.close()
assert not errors, errors
print('ALL OK')
