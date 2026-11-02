#!/usr/bin/env python3
import base64,os,pathlib,sys
kind=sys.argv[2]
if kind not in ('ready','conflict','detail'):raise SystemExit('Invalid image kind')
f=pathlib.Path(os.environ['RUNNER_TEMP'])/('guide-lab-'+kind+'.jpg');s=base64.b64encode(f.read_bytes()).decode('ascii');parts=[s[i:i+4000] for i in range(0,len(s),4000)]
if len(parts)>24:raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=GUIDE_LAB_{kind.upper()}_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
