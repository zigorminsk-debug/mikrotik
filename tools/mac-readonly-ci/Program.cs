// Research only: no writes, no production integration or physical devices.
// Credentials are passed on stdin, never in process arguments or CI output.
using System;
using System.Linq;
using System.Text.Json;
using tik4net;
using tik4net.WinboxCliMac;

try
{
    using var input = JsonDocument.Parse(Console.ReadLine() ?? "{}");
    var root = input.RootElement;
    var mac = root.GetProperty("mac").GetString() ?? throw new ArgumentException();
    var password = root.GetProperty("password").GetString() ?? throw new ArgumentException();
    var setup = new TikConnectionSetup(TikRouterAddress.FromMac(mac), "admin", password)
    {
        DebugEnabled = false,
        ConnectTimeout = TimeSpan.FromSeconds(12),
        ReceiveTimeout = TimeSpan.FromSeconds(15),
        SendTimeout = TimeSpan.FromSeconds(15)
    };
    using var connection = setup.CreateWinboxCliMacConnection();
    var rows = connection.CreateCommand("/system/resource/print").ExecuteList().ToArray();
    if (rows.Length != 1 || !rows[0].GetResponseField("version").StartsWith("7.23.8")) throw new InvalidOperationException("Wrong device or version");
    Console.WriteLine("{\"ok\":true}");
}
catch (Exception ex)
{
    // Do not include exception messages, response data, stack traces or secrets.
    var names = new System.Collections.Generic.List<string>();
    for (Exception? current=ex; current!=null && names.Count<4; current=current.InnerException) {
        names.Add(current.GetType().Name);
        // Classify known constant failure stages, never serialize exception text.
        if (current.Message.Contains("No usable local network interface")) names.Add("NoUsableNic");
        else if (current.Message.Contains("MAC-WinBox: bad challenge (none)")) names.Add("ChallengeNone");
        else if (current.Message.Contains("MAC-WinBox: bad challenge")) names.Add("BadChallenge");
        else if (current.Message.Contains("MAC-Winbox: no server confirmation", StringComparison.OrdinalIgnoreCase)) names.Add("NoConfirmation");
    }
    Console.WriteLine(JsonSerializer.Serialize(new {ok=false, category=string.Join("_", names)}));
    Environment.ExitCode = 1;
}
