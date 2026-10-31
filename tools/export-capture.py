#!/usr/bin/env python3
"""Export portions of a disposable experimental screen through check annotations.

Only for the isolated test VM; never use on real credentials or routers. GitHub
limits both annotation count per step and message length, so steps export slices.
"""
import base64
import os
import pathlib
import sys

kind = sys.argv[2] if len(sys.argv) > 2 else 'ntp'
if kind not in ('ntp','clock','applied'):
    raise SystemExit('Invalid capture kind')
shot = pathlib.Path(os.environ['RUNNER_TEMP']) / 'routeros-capture/output' / ({'ntp':'winbox.jpg','clock':'clock.jpg','applied':'applied.jpg'}[kind])
if not shot.exists():
    print('No experimental image was created')
    raise SystemExit(0)
data = base64.b64encode(shot.read_bytes()).decode()
parts = [data[i:i+4000] for i in range(0, len(data), 4000)]
start = int(sys.argv[1])
if len(parts) > 30:
    print('::warning::Screenshot too large for annotations; use artifact instead')
else:
    for i in range(start, min(start+10, len(parts))):
        print(f'::notice title={kind.upper()}_PART_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
