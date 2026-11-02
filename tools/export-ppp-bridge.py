#!/usr/bin/env python3
"""Export only isolated CI screenshots; no log, key or user data."""
import base64, os, pathlib, sys
kind, offset = sys.argv[1], int(sys.argv[2])
if kind not in ('ppp', 'bridge') or offset not in (0, 10, 20):
    raise SystemExit('Invalid arguments')
path = pathlib.Path(os.environ['RUNNER_TEMP']) / 'routeros-capture' / 'output' / (kind + '.jpg')
if not path.is_file(): raise SystemExit('Expected screenshot is missing')
data = base64.b64encode(path.read_bytes()).decode('ascii')
parts = [data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>30: raise SystemExit('Screenshot too large for annotations')
for i in range(offset,min(offset+10,len(parts))):
    print(f'::notice title={kind.upper()}_PART_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
