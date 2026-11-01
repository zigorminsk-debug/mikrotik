// ISOLATED CI ONLY. The transport is patched to localhost, the selected MAC
// and plan are pinned to a synthetic CHR fixture. This is not application code.
// Password and commands come from stdin, never argv, logs, or artifact files.
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using tik4net;
using tik4net.WinboxCliMac;

const string fixtureHash="2043111944798745408b19ee3fb089087d290f5012ac0aea93cce57ccb7cabe7";
int index=-1; string stage="fixture";
try {
    using var input=JsonDocument.Parse(Console.ReadLine() ?? "{}");
    var root=input.RootElement;
    var password=root.GetProperty("password").GetString() ?? throw new ArgumentException();
    var mac=root.GetProperty("mac").GetString();
    var commands=root.GetProperty("commands").EnumerateArray().Select(x=>x.GetString() ?? "").ToArray();
    string digest=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("\n",commands)))).ToLowerInvariant();
    if(mac!="02:11:22:33:44:55" || commands.Length!=44 || digest!=fixtureHash) throw new InvalidOperationException();
    stage="connect";
    var setup=new TikConnectionSetup(TikRouterAddress.FromMac(mac),"admin",password) {
        DebugEnabled=false, ConnectTimeout=TimeSpan.FromSeconds(12), ReceiveTimeout=TimeSpan.FromSeconds(25), SendTimeout=TimeSpan.FromSeconds(25)
    };
    using var connection=setup.CreateWinboxCliMacConnection();
    stage="apply";
    for(index=0;index<commands.Length;index++) connection.CreateRawCommand(commands[index]).ExecuteNonQuery();
    stage="duplicate-negative";
    // Only this known duplicate is tried against the disposable test VM. An
    // exception message or raw router output must never reach the CI logs.
    bool rejected=false;
    try { connection.CreateRawCommand("/interface bridge add name=bridge-lan").ExecuteNonQuery(); }
    catch (TikCommandTrapException) { rejected=true; }
    if(!rejected) throw new InvalidOperationException();
    // Verify the successful fixture before simulating a one-way loss. The CI
    // parent must explicitly release this checkpoint; no commands are read.
    stage="checkpoint";
    Console.WriteLine("{\"checkpoint\":true}");
    if(Console.ReadLine() != "drop-replies") throw new InvalidOperationException();
    stage="interrupted-unknown";
    bool interrupted=false;
    try { connection.CreateRawCommand("/system identity set name=\"CI interrupted probe\"").ExecuteNonQuery(); }
    catch (Exception) { interrupted=true; }
    if(!interrupted) throw new InvalidOperationException();
    // A send failure is not proof that the command was not executed.
    Console.WriteLine("{\"ok\":true,\"interrupted\":true}");
} catch(Exception) {
    Console.WriteLine(JsonSerializer.Serialize(new {ok=false,stage,index}));
    Environment.ExitCode=1;
}
