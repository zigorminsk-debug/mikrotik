#!/usr/bin/env python3
# Only disposable emulator screenshots from this CI run, never user data.
import base64, io, os, pathlib, sys
from PIL import Image
kind = sys.argv[1]
if kind not in ('failure', 'menu', 'about', 'reading'):
    raise SystemExit('Invalid screenshot')
p = pathlib.Path(os.environ['RUNNER_TEMP']) / ('android-font-' + kind + '.png')
if not p.is_file():
    raise SystemExit(0)
out = io.BytesIO()
with Image.open(p) as image:
    image.convert('RGB').save(out, format='JPEG', quality=35, optimize=True)
b = base64.b64encode(out.getvalue()).decode('ascii')
parts = [b[i:i+4000] for i in range(0, len(b), 4000)]
if len(parts) > 20:
    raise SystemExit('Screenshot exceeds annotation budget')
start = int(sys.argv[2])
for i in range(start, min(start+10, len(parts))):
    print(f'::notice title=ANDROID_FONT_{kind.upper()}_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
