"""Package the built extension, never project sources or server configuration."""
from pathlib import Path
import json, zipfile, hashlib
root=Path(__file__).resolve().parents[1]
dist=root/'browser-extension/dist'; manifest=json.loads((dist/'manifest.json').read_text())
assert manifest.get('manifest_version')==3 and manifest.get('key'), 'Missing extension manifest/key'
expected=[manifest['background']['service_worker'],manifest['action']['default_popup']]
for script in manifest.get('content_scripts',[]):expected.extend(script['js'])
for path in expected:assert (dist/path).is_file(), f'Missing extension entry: {path}'
out=root/'frontend/public/downloads';out.mkdir(parents=True,exist_ok=True)
archive=out/'rip-market-extension.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for path in sorted(dist.rglob('*')):
  if path.is_file() and not path.is_symlink() and path.suffix in ['.js','.json','.html','.css','.png','.svg','.woff','.woff2']:
   assert not path.name.startswith('.env')
   z.write(path,'R.I.P-Market-Extension/'+str(path.relative_to(dist)))
(out/'extension.json').write_text(json.dumps({'version':manifest['version'],'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size}))
print('Packaged extension',manifest['version'])
