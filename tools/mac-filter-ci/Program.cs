// CI-only, loopback-only regression for a temporary third-party source patch.
// Does not authenticate, connect to RouterOS or send UDP to a real network.
using System.Net;
using System.Net.Sockets;
using System.Reflection;

if (args.Length != 2 || (args[1] != "wildcard" && args[1] != "filtered")) throw new ArgumentException("Expected assembly and mode");
var assemblyPath = Path.GetFullPath(args[0]);
AppDomain.CurrentDomain.AssemblyResolve += (_, e) => {
    var path=Path.Combine(Path.GetDirectoryName(assemblyPath)!,new AssemblyName(e.Name).Name+".dll");
    return File.Exists(path) ? Assembly.LoadFrom(path) : null;
};
var assembly=Assembly.LoadFrom(assemblyPath);
var type=assembly.GetType("tik4net.Winbox.WinboxMacM2Session",true)!;
var baseType=type.BaseType!;
var instance=Activator.CreateInstance(type,BindingFlags.Instance|BindingFlags.NonPublic,null,new object[]{"02:11:22:33:44:55"},null)!;
var fields=BindingFlags.Instance|BindingFlags.NonPublic;
void Set(string name,object? val) => (baseType.GetField(name,fields) ?? throw new Exception("Field unavailable")).SetValue(instance,val);
using var receive=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
using var send=new UdpClient(AddressFamily.InterNetwork);
var target=(IPEndPoint)receive.Client.LocalEndPoint!;
byte[] router={0x02,0x11,0x22,0x33,0x44,0x55},local={0x02,0xaa,0xbb,0xcc,0xdd,0xee};
Set("_udp",receive);Set("_routerMac",router);Set("_localMac",local);Set("_clientType",(ushort)0x0f90);Set("_sessionKey",(ushort)0x1234);
Set("_routerUnicastEp",new IPEndPoint(IPAddress.Loopback,20561));
var method=baseType.GetMethod("ReceiveOne",fields) ?? throw new Exception("Receive path unavailable");
bool Deliver(byte[] data) {
    send.Send(data,data.Length,target);
    if (!SpinWait.SpinUntil(()=>receive.Available>0,2000)) throw new Exception("Loopback timeout");
    bool called=false;
    Func<byte,byte[],uint,bool> callback=(t,p,c)=> {called=true;return true;};
    bool result=(bool)method.Invoke(instance,new object[]{callback})!;
    if (result!=called) throw new Exception("Unexpected receive return");
    return called;
}
byte[] Good() {
    var p=new byte[22];p[0]=1;p[1]=2;Array.Copy(router,0,p,2,6);Array.Copy(local,0,p,8,6);
    p[14]=0x0f;p[15]=0x90;p[16]=0x12;p[17]=0x34;return p;
}
if (!Deliver(Good())) throw new Exception("Valid control rejected");
if (Deliver(new byte[2])) throw new Exception("Short datagram accepted");
var variants=new Dictionary<string,int>{{"version",0},{"router",2},{"destination",8},{"client-type",14},{"session",16}};
foreach (var (label,offset) in variants) {
    var p=Good();p[offset]^=1;
    bool accepted=Deliver(p), expected=args[1]=="wildcard";
    if (accepted!=expected) throw new Exception("Unexpected result: "+label);
}
Console.WriteLine(args[1]+": correct ACK accepted; short packet rejected; altered fields "+(args[1]=="filtered"?"rejected":"accepted")+" on Windows loopback. No RouterOS or physical network tested.");

// The parallel candidate-probe ACK path is a separate receive implementation.
// This is a synthetic loopback demonstration, not a production security fix.
var probeType=baseType.GetNestedType("CandidateProbe",BindingFlags.NonPublic) ?? throw new Exception("Candidate probe unavailable");
var probe=Activator.CreateInstance(probeType,true) ?? throw new Exception("Cannot create probe");
var probeFields=BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.Public;
void SetProbe(string name,object? value) => (probeType.GetField(name,probeFields) ?? throw new Exception("Probe field unavailable")).SetValue(probe,value);
using var probeSocket=new UdpClient(new IPEndPoint(IPAddress.Loopback,0));
SetProbe("Udp",probeSocket);SetProbe("LocalMac",local);SetProbe("SessionKey",(ushort)0x1234);
var probeMethod=probeType.GetMethod("TryReadAck",probeFields) ?? throw new Exception("Probe receive unavailable");
bool Probe(byte[] data) {
    var ep=(IPEndPoint)probeSocket.Client.LocalEndPoint!;
    send.Send(data,data.Length,ep);
    if(!SpinWait.SpinUntil(()=>probeSocket.Available>0,2000))throw new Exception("Probe loopback timeout");
    var parameters=new object[]{router,(uint)0};
    return (bool)probeMethod.Invoke(probe,parameters)!;
}
if(!Probe(Good()))throw new Exception("Probe valid ACK rejected");
if(Probe(new byte[2]))throw new Exception("Probe short ACK accepted");
foreach(var (label,offset,accepted) in new[]{("version",0,true),("router",2,false),("destination",8,true),("client-type",14,true),("session",16,false),("type",1,false)}) {
    var p=Good();p[offset]^=1;
    if(Probe(p)!=accepted)throw new Exception("Probe unexpected result: "+label);
}
Console.WriteLine("::notice title=Windows candidate ACK research::Both temporary variants accepted synthetic candidate ACKs with modified version, destination or client type, but rejected wrong session, router and packet type on loopback. This is not a complete security analysis or a physical-network test.");
