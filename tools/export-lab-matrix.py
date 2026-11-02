#!/usr/bin/env python3
"""Export only the mocked tutorial screenshot as CI annotations."""
import base64, os, pathlib, sys
start = int(sys.argv[1])
if start not in (0, 10, 20): raise SystemExit('Invalid offset')
f = pathlib.Path(os.environ['RUNNER_TEMP']) / 'lab-matrix.jpg'
data = base64.b64encode(f.read_bytes()).decode('ascii')
parts = [data[i:i+4000] for i in range(0, len(data), 4000)]
if len(parts) > 30: raise SystemExit('Screenshot exceeds annotation budget')
for i in range(start, min(start+10, len(parts))): print(f'::notice title=LAB_MATRIX_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
