#!/usr/bin/env python3
# CI-only throwaway scheme screenshot; manually inspect before use.
import base64,os,pathlib,sys
p=pathlib.Path(os.environ['RUNNER_TEMP'])/'lab-scheme-winbox.jpg'
b=base64.b64encode(p.read_bytes()).decode('ascii');parts=[b[i:i+4000] for i in range(0,len(b),4000)]
if len(parts)>45:raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=LAB_SCHEME_WINBOX_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
