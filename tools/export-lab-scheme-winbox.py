#!/usr/bin/env python3
# CI-only throwaway scheme screenshot; manually inspect before use.
import base64,os,pathlib,sys
kind=sys.argv[2] if len(sys.argv)>2 else 'address'
if kind not in ('address','dhcp','print'):raise SystemExit('Invalid image')
p=pathlib.Path(os.environ['RUNNER_TEMP'])/({'dhcp':'lab-scheme-dhcp.jpg','print':'lab-scheme-print.jpg','address':'lab-scheme-winbox.jpg'}[kind])
b=base64.b64encode(p.read_bytes()).decode('ascii');parts=[b[i:i+4000] for i in range(0,len(b),4000)]
if len(parts)>24:raise SystemExit('Screenshot exceeds annotation budget')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=LAB_SCHEME_{kind.upper()}_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
