"""Read-only verification of the newly built release artifacts."""
from pathlib import Path, PurePosixPath
import base64, hashlib, json, re, sys, zipfile
root = Path(sys.argv[1])
manifest = json.loads((root/'browser-extension/manifest.json').read_text(encoding='utf-8'))
metadata = json.loads((root/'frontend/public/downloads/extension.json').read_text(encoding='utf-8'))
archive = root/'frontend/public/downloads/rip-market-extension.zip'
blob = archive.read_bytes()
digest = hashlib.sha256(blob).hexdigest()
extension_id = ''.join(chr(ord('a')+int(c,16)) for c in hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32])
assert manifest['manifest_version'] == 3
assert manifest['version'] == metadata['version'] == '0.6.74'
assert extension_id == 'gmmlnkjdbcoojbhndjcfehojknjamaoj'
assert metadata['sha256'] == digest and metadata['bytes'] == len(blob)
secret = re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:access_token|api_key|password)\s*[:=]\s*["\'][A-Za-z0-9_+/=-]{24,}["\']', re.I)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    names = z.namelist()
    assert len(names) == len(set(names))
    prefix = 'R.I.P-Market-Extension/'
    assert all(n.startswith(prefix) and '..' not in PurePosixPath(n).parts and not re.search(r'\.env|\.test\.|\.spec\.|node_modules|\.map$', n) for n in names)
    assert json.loads(z.read(prefix+'manifest.json')) == manifest
    required = [manifest['background']['service_worker'], manifest['action']['default_popup'], 'popup/order-consent.html']
    for item in manifest.get('content_scripts', []): required += item['js']
    for name in required: assert prefix+name in names, name
    for name in names:
        if name.endswith(('.js','.json','.html')):
            text = z.read(name).decode('utf-8')
            assert not secret.search(text), 'Possible embedded secret: '+name
            assert not re.search(r'https?://(?:localhost|127\.0\.0\.1)(?::\d+)?/api', text), 'Local API endpoint in package: '+name
frontend_files = list((root/'frontend/dist/assets').glob('*.js'))
assert frontend_files, 'No frontend build'
frontend = '\n'.join(p.read_text(encoding='utf-8') for p in frontend_files)
assert 'https://p2pcs.ru/api/v1' in frontend
assert not re.search(r'https?://(?:localhost|127\.0\.0\.1)(?::\d+)?/api', frontend)
assert not secret.search(frontend), 'Possible frontend secret'
print(json.dumps({'VERSION':'0.6.74','EXTENSION_ID':extension_id,'SHA256':digest,'BYTES':len(blob),'ARTIFACTS':'PASS'}))
