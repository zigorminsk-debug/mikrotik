#!/usr/bin/env python3
import base64, os, pathlib, sys
shot = pathlib.Path(os.environ['RUNNER_TEMP']) / 'chr-warning.jpg'
data = base64.b64encode(shot.read_bytes()).decode()
parts = [data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>40:
    raise SystemExit('Native screenshot exceeds annotation limit')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):
    print(f'::notice title=SHOT_PART_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
