#!/usr/bin/python3
"""CI screenshot transport only; never export keys, configuration or logs."""
import base64, os, pathlib, sys
name=sys.argv[1]
if name not in ('cert-menu','cert-list','cert-form'):raise SystemExit('Unexpected image')
p=pathlib.Path(os.environ['RUNNER_TEMP'])/'routeros-capture'/'output'/(name+'.jpg')
data=base64.b64encode(p.read_bytes()).decode('ascii');parts=[data[i:i+4000] for i in range(0,len(data),4000)]
if len(parts)>45:raise SystemExit('Image too big for job annotation limit')
for i,part in enumerate(parts):print(f'::notice title={name}_PART_{i:02d}_OF_{len(parts):02d}::{part}')
