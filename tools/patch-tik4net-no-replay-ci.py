#!/usr/bin/env python3
"""Research only: prohibit replay after the pinned MAC session closes.

Not shipped. A timeout still means a command may have executed; no rollback
is implied. Only this CI copy is patched and exercised against localhost.
"""
import pathlib, sys
p = pathlib.Path(sys.argv[1]) / 'tik4net/WinboxCliMac/WinboxCliMacConnection.cs'
s = p.read_text()
old = 'private bool ReconnectAllowed => !SafeModeHeld;'
if s.count(old) != 1:
    raise SystemExit('Unexpected pinned MAC reconnect policy')
s = s.replace(old, 'private bool ReconnectAllowed => false; // CI only: never replay a command')
p.write_text(s)
