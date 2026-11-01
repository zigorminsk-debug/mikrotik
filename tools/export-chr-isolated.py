#!/usr/bin/env python3
# Synthetic Electron images only; never use with real configurations/secrets.
import base64, os, pathlib, sys
kind=sys.argv[2]
if kind not in ('button','diagram','settings'): raise SystemExit('Invalid screenshot kind')
f=pathlib.Path(os.environ['RUNNER_TEMP']) / f'chr-isolated-{kind}.jpg'
if not f.is_file(): raise SystemExit('Missing screenshot')
data=base64.b64encode(f.read_bytes()).decode('ascii')
parts=[data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>24: raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))): print(f'::notice title=CHR_ISOLATED_{kind.upper()}_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
