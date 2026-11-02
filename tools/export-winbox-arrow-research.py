#!/usr/bin/env python3
# Test fixture only: export small annotated JPEG in check annotations for review.
import base64,os,pathlib,sys
if len(sys.argv)!=3 or sys.argv[1] not in ('original','address','network','interface'):raise SystemExit('Invalid fixture')
name=sys.argv[1]
start=int(sys.argv[2])
if start not in (0,10,20):raise SystemExit('Invalid chunk')
p=pathlib.Path(os.environ['RUNNER_TEMP'])/'arrow-research'/(name+'.jpg')
b=base64.b64encode(p.read_bytes()).decode('ascii')
parts=[b[i:i+4000] for i in range(0,len(b),4000)]
if len(parts)>24:raise SystemExit('Screenshot exceeds annotation budget')
for i in range(start,min(start+10,len(parts))):
 part=parts[i]
 print(f'::notice title=RESEARCH_ARROW_{name.upper()}_{i:02d}_OF_{len(parts):02d}::{part}')
