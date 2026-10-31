#!/usr/bin/env python3
"""Export actual Electron screenshot through CI annotations, no third-party images."""
import base64, os, pathlib, sys
file = pathlib.Path(os.environ['RUNNER_TEMP']) / 'physical-discovery.jpg'
if not file.exists():
    print('::error title=Screenshot diagnostic::Missing application screenshot')
    raise SystemExit(1)
text = base64.b64encode(file.read_bytes()).decode('ascii')
parts = [text[i:i+4000] for i in range(0, len(text), 4000)]
if len(parts) > 30:
    print(f'::error title=Screenshot diagnostic::Image has {file.stat().st_size} bytes, {len(parts)} parts; maximum 30')
    raise SystemExit(1)
start = int(sys.argv[1])
for i in range(start, min(start + 10, len(parts))):
    print(f'::notice title=PHYSICAL_DISCOVERY_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
