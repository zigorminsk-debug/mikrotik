#!/usr/bin/env python3
"""One-line experiment against the exact pinned tik4net source copy, CI only.

This is NOT a production fix: wildcard binding alone cannot safely select a NIC,
filter sessions, prove authenticity, or handle multi-adapter networks. The test
namespace has exactly one eligible interface and no physical/external network.
"""
import pathlib, sys
path=pathlib.Path(sys.argv[1])/'tik4net/MacTelnet/MacLayerTransport.cs'
s=path.read_text()
old='_udp.Client.Bind(new IPEndPoint(nic.LocalIp ?? IPAddress.Any, 0));'
new='_udp.Client.Bind(new IPEndPoint(IPAddress.Any, 0));'
if s.count(old)!=1:raise SystemExit('Pinned source did not match the expected single binding')
path.write_text(s.replace(old,new))
