#!/usr/bin/env python3
"""Small, explicitly unsafe-to-ship experiments on a pinned CI source copy.

Even the filtered variant only guards a single receive path: it does not secure
multi-NIC candidate probing, NIC selection, message authentication or Windows.
"""
import pathlib, sys
path=pathlib.Path(sys.argv[1])/'tik4net/MacTelnet/MacLayerTransport.cs'
s=path.read_text()
old='_udp.Client.Bind(new IPEndPoint(nic.LocalIp ?? IPAddress.Any, 0));'
new='_udp.Client.Bind(new IPEndPoint(IPAddress.Any, 0));'
if s.count(old)!=1:raise SystemExit('Pinned source did not match the expected single binding')
s=s.replace(old,new)
if len(sys.argv)>2 and sys.argv[2]=='filter':
    old='''            byte[] pkt = _udp.Receive(ref ep);
            var parsed = ParsePacket(pkt);'''
    new='''            byte[] pkt = _udp.Receive(ref ep);
            // CI-only single-NIC check; not a complete security implementation.
            if (pkt.Length < 22 || pkt[0] != 1 ||
                !pkt.Skip(2).Take(6).SequenceEqual(_routerMac) ||
                !pkt.Skip(8).Take(6).SequenceEqual(_localMac) ||
                pkt[14] != (byte)(_clientType >> 8) || pkt[15] != (byte)_clientType ||
                pkt[16] != (byte)(_sessionKey >> 8) || pkt[17] != (byte)_sessionKey)
                return false;
            var parsed = ParsePacket(pkt);'''
    if s.count(old)!=1:raise SystemExit('Pinned source did not match the expected receive path')
    s=s.replace(old,new)
path.write_text(s)
