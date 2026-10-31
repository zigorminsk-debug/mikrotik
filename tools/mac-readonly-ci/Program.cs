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
    // This optional CI fixture validates only predefined test data. It is not
    // device authentication and is not exposed to the application.
    if (root.TryGetProperty("inventory", out var inventory) && inventory.ValueKind == JsonValueKind.True)
    {
        var expectedName = root.GetProperty("expectedIdentity").GetString() ?? throw new ArgumentException();
        var identity = connection.CreateCommand("/system/identity/print").ExecuteList().ToArray();
        var ethernet = connection.CreateCommand("/interface/ethernet/print").ExecuteList().ToArray();
        if (identity.Length != 1 || identity[0].GetResponseField("name") != expectedName) throw new InvalidOperationException();
        if (!ethernet.Any(row => row.GetResponseField("name") == "ether1" &&
            string.Equals(row.GetResponseField("mac-address"), mac, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException();
    }
    Console.WriteLine("{\"ok\":true}");
}
catch (Exception ex)
{
    // Do not include exception messages, response data, stack traces or secrets.
    // Output only fixed constants, never dynamically constructed exception names.
    var category = "Other";
    for (Exception? current=ex; current!=null; current=current.InnerException) {
        if (current.Message.Contains("No usable local network interface")) { category = "NoUsableNic"; break; }
        if (current.Message.Contains("MAC-WinBox: bad challenge (none)")) { category = "ChallengeNone"; break; }
        if (current.Message.Contains("MAC-WinBox: bad challenge")) { category = "BadChallenge"; break; }
        if (current.Message.Contains("MAC-Winbox: no server confirmation", StringComparison.OrdinalIgnoreCase)) { category = "NoConfirmation"; break; }
    }
    Console.WriteLine(JsonSerializer.Serialize(new {ok=false, category}));
    Environment.ExitCode = 1;
}
