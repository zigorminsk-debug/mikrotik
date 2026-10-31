#!/usr/bin/env python3
"""CI ONLY: force the pinned filtered MAC client through 127.0.0.1.

This is intentionally *not* a real NIC or production transport. A CI-only
Ethernet/UDP shim connects loopback to an isolated disposable QEMU CHR. Never
ship this patched source or accept user credentials through this harness.
"""
import pathlib, sys
p=pathlib.Path(sys.argv[1])/'tik4net/MacTelnet/MacLayerTransport.cs'
s=p.read_text()
start=s.index('            // Two ways in, and they differ only in how the local NIC is chosen.')
last='            BindToCandidate(_candidates[0], host);'
end=s.index(last,start)+len(last)
patch='''            // CI-only: no real network adapter and no external broadcasts.
            _bindHost = "127.0.0.1";
            _localMac = new byte[] { 0x02, 0xaa, 0xbb, 0xcc, 0xdd, 0xee };
            _udp = new UdpClient(AddressFamily.InterNetwork);
            _udp.Client.Bind(new IPEndPoint(IPAddress.Loopback, 0));
            _routerEp = new IPEndPoint(IPAddress.Loopback, 20561);
            _routerUnicastEp = _routerEp;
            _outCounter = 0;
            _inCounter = 0;'''
s=s[:start]+patch+s[end:]
p.write_text(s)
