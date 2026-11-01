#!/usr/bin/env python3
# Isolated CI screenshots only, never user router data or credentials.
import base64, os, pathlib, sys
kind=sys.argv[2]
if kind not in ('existing','new'): raise SystemExit('Invalid screenshot kind')
file=pathlib.Path(os.environ['RUNNER_TEMP'])/'routeros-capture/output'/f'dhcp-{kind}.jpg'
if not file.exists(): raise SystemExit('DHCP client screenshot missing')
data=base64.b64encode(file.read_bytes()).decode('ascii')
parts=[data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>24: raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))): print(f'::notice title=DHCP_{kind.upper()}_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
