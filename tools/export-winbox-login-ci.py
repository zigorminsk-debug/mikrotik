#!/usr/bin/env python3
# Screenshot from throwaway runner only; no passwords or physical router.
import base64,os,pathlib,sys
p=pathlib.Path(os.environ['RUNNER_TEMP'])/'winbox-login-ci.jpg'
s=base64.b64encode(p.read_bytes()).decode('ascii');parts=[s[i:i+4000] for i in range(0,len(s),4000)]
if len(parts)>40:raise SystemExit('Image too large')
start=int(sys.argv[1])
for i in range(start,min(start+10,len(parts))):print(f'::notice title=WINBOX_LOGIN_CI_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
