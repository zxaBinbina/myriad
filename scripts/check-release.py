"""Check the shipped archives, then write checksums for the verified release files."""
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'apps/extension/.output'
VERSION = json.loads((ROOT / 'apps/extension/package.json').read_text())['version']
TAG = os.environ.get('GITHUB_REF', '')
if TAG.startswith('refs/tags/') and TAG != f'refs/tags/v{VERSION}':
    raise SystemExit(f'Tag must match extension version: v{VERSION}')
checksums = []
for browser in ('chrome', 'firefox'):
    path = OUTPUT / f'myriad-{VERSION}-{browser}.zip'
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate archive entries'
        for name in names:
            assert not name.startswith('/') and '..' not in Path(name).parts, name
            assert not re.search(r'(^|/)(node_modules|\.git|\.local|\.env[^/]*|\.dev\.vars[^/]*|wrangler[^/]*|.*\.map)($|/)', name), name
            assert not name.endswith('.ts') and '-dev' not in name, name
        manifest = json.loads(archive.read('manifest.json'))
        assert manifest['manifest_version'] == 3
        assert manifest['version'] == VERSION
        assert set(manifest['permissions']) == {'storage', 'geolocation'}
        assert not manifest.get('host_permissions'), 'No installation-time host access'
        assert 'declarativeNetRequest' not in manifest['optional_permissions']
        assert manifest['chrome_url_overrides']['newtab'] == 'newtab.html'
        assert (ROOT / 'LICENSE').read_bytes() == archive.read('LICENSE')
        assert len(archive.read('THIRD_PARTY_NOTICES.txt')) > 1000
        for icon in manifest.get('icons', {}).values():
            assert icon in names, icon
        assert manifest['background']['service_worker'] in names
        html = archive.read('newtab.html').decode()
        styles = re.findall(r'<link[^>]*href="([^"]+\.css)"', html)
        assert styles, 'Missing entry CSS'
        css = '\n'.join(archive.read(s.lstrip('/')).decode() for s in styles)
        assert all(token in css for token in ('--bg:', '--text:', '.m-grid', '.m-btn', '.myriad')), 'Missing theme or base styles'
        if browser == 'firefox':
            assert manifest['browser_specific_settings']['gecko']['id']
    checksums.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n')
    print(f'PASS {path.name}: manifest, permissions, linked styles, license and archive contents')
(OUTPUT / 'SHA256SUMS').write_text(''.join(checksums))
print(f'PASS release version v{VERSION} and SHA256SUMS')
