#!/usr/bin/env python3
"""Transfer unmodified Windows Electron screenshot through CI annotations."""
import base64, os, pathlib, sys
p = pathlib.Path(os.environ['RUNNER_TEMP']) / 'diagram-export-ui.jpg'
text = base64.b64encode(p.read_bytes()).decode('ascii')
parts = [text[i:i+4000] for i in range(0, len(text), 4000)]
if len(parts) > 40:
    raise SystemExit('Screenshot too large for annotation export')
start = int(sys.argv[1])
for i in range(start, min(start + 10, len(parts))):
    print(f'::notice title=DIAGRAM_UI_{i:02d}_OF_{len(parts):02d}::{parts[i]}')
