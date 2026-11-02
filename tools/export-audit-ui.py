#!/usr/bin/python3
"""Publish CI-only synthetic Electron screenshot as annotation chunks."""
import base64, os, pathlib, sys
path=pathlib.Path(os.environ['RUNNER_TEMP'])/'audit-ui-mocked.jpg'
data=base64.b64encode(path.read_bytes()).decode('ascii')
parts=[data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>24:raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=AUDIT_UI_MOCKED_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
