using System.Text;
using System.Text.Json;

namespace NavdeckLogbook;

// All data stays on this PC in %APPDATA%\NAVDECK Logbook (one small file per flight).
internal sealed class LogbookStore
{
    private readonly string _flightsDir;
    private readonly string _settingsPath;

    public string RootDir { get; }

    public LogbookStore(string? root = null)
    {
        RootDir = root ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NAVDECK Logbook");
        _flightsDir = Path.Combine(RootDir, "flights");
        _settingsPath = Path.Combine(RootDir, "settings.json");
        Directory.CreateDirectory(_flightsDir);
    }

    public AppSettings LoadSettings()
    {
        try
        {
            return File.Exists(_settingsPath)
                ? JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_settingsPath), Json.Options) ?? new AppSettings()
                : new AppSettings();
        }
        catch (Exception)
        {
            return new AppSettings();
        }
    }

    public void SaveSettings(AppSettings settings) =>
        WriteAtomic(_settingsPath, JsonSerializer.Serialize(settings, Json.Options));

    public List<FlightRecord> LoadAll()
    {
        var list = new List<FlightRecord>();
        foreach (var file in Directory.EnumerateFiles(_flightsDir, "*.json"))
        {
            try
            {
                if (JsonSerializer.Deserialize<FlightRecord>(File.ReadAllText(file), Json.Options) is { } f)
                    list.Add(f);
            }
            catch (Exception)
            {
                // A damaged file must never stop the logbook opening.
            }
        }
        list.Sort((a, b) => (b.StartUtc ?? DateTime.MinValue).CompareTo(a.StartUtc ?? DateTime.MinValue));
        return list;
    }

    public void Save(FlightRecord flight) =>
        WriteAtomic(PathFor(flight), JsonSerializer.Serialize(flight, Json.Options));

    public void Delete(FlightRecord flight)
    {
        try { File.Delete(PathFor(flight)); } catch (Exception) { }
    }

    public static string ToCsv(IEnumerable<FlightRecord> flights, bool kg)
    {
        string Fuel(int? lb) => lb is { } v ? (kg ? Math.Round(v * Fmt.LbToKg) : v).ToString("0") : "";
        string Q(string s) => "\"" + s.Replace("\"", "\"\"") + "\"";
        var sb = new StringBuilder();
        sb.AppendLine("Date,Callsign,Aircraft,From,To,Gate out (UTC),Take-off (UTC),Landing (UTC),Gate in (UTC)," +
                      "Block,Air,Fuel out,Fuel take-off,Fuel landing,Fuel in,Fuel burned,Unit," +
                      "Landing rate (fpm),Runway,Touchdown from threshold (ft),Touchdown offset (ft),Go-arounds");
        foreach (var f in flights)
        {
            sb.AppendLine(string.Join(",",
                Fmt.Date(f.StartUtc), Q(f.Callsign), Q(f.Aircraft), f.Origin, f.Destination,
                Fmt.Time(f.GateOutUtc), Fmt.Time(f.TakeoffUtc), Fmt.Time(f.LandingUtc), Fmt.Time(f.GateInUtc),
                Fmt.Duration(f.BlockTime), Fmt.Duration(f.AirTime),
                Fuel(f.FuelGateOutLb), Fuel(f.FuelTakeoffLb), Fuel(f.FuelLandingLb), Fuel(f.FuelGateInLb),
                Fuel(f.FuelBurnedLb), kg ? "kg" : "lb",
                f.LandingRateFpm?.ToString() ?? "", f.LandingAirport + " " + f.LandingRunway,
                f.TouchdownDistanceFt?.ToString("0") ?? "", f.TouchdownOffsetFt?.ToString("0.0") ?? "",
                f.GoArounds));
        }
        return sb.ToString();
    }

    private string PathFor(FlightRecord f) => Path.Combine(_flightsDir, f.Id + ".json");

    private static void WriteAtomic(string path, string content)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, content);
        File.Move(tmp, path, overwrite: true);
    }
}
