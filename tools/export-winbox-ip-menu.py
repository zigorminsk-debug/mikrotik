#!/usr/bin/env python3
# Only isolated, disposable CI screenshots; never user router data.
import base64, os, pathlib, sys
file=pathlib.Path(os.environ['RUNNER_TEMP'])/'routeros-capture/output/ip-menu.jpg'
if not file.exists(): raise SystemExit('IP menu capture missing')
data=base64.b64encode(file.read_bytes()).decode('ascii')
parts=[data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>30: raise SystemExit('Image exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=IP_MENU_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
