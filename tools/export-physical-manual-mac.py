#!/usr/bin/env python3
"""Export unchanged CI screenshots; never captures user credentials."""
import base64, os, pathlib, sys
kind='manual'

file=pathlib.Path(os.environ['RUNNER_TEMP'])/'physical-manual-mac.jpg'
text=base64.b64encode(file.read_bytes()).decode('ascii')
parts=[text[i:i+4000] for i in range(0,len(text),4000)]
if len(parts)>24:raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=PHYSICAL_MAC_{kind.upper()}_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
