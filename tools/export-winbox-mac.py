#!/usr/bin/env python3
"""Export one unchanged WinBox screenshot through Actions annotations."""
import base64,os,pathlib,sys
file=pathlib.Path(os.environ['RUNNER_TEMP'])/'mac-capture'/'output'/'mac-neighbors.jpg'
if not file.exists():raise SystemExit('No WinBox capture')
text=base64.b64encode(file.read_bytes()).decode('ascii')
parts=[text[i:i+4000] for i in range(0,len(text),4000)]
if len(parts)>30:raise SystemExit('WinBox capture exceeds annotation limit')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=MAC_NEIGHBORS_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
