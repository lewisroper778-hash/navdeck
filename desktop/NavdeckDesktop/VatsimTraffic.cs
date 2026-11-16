using System.Net.Http;
using System.Text.Json;

namespace NavdeckLink;

// Only public simulated aircraft positions from VATSIM's unauthenticated Data API.
// Personal identifiers and pilot names are intentionally excluded from the model.
internal sealed record VatsimTrafficAircraft(
    string callsign, double lat, double lon,
    int altitude_ft, int groundspeed_kt, int heading_deg,
    string aircraft, string origin, string destination);

internal sealed class VatsimTrafficFeed : IDisposable
{
    private const string FeedUrl = "https://data.vatsim.net/v3/vatsim-data.json";
    private static readonly HttpClient Client = new()
    {
        Timeout = TimeSpan.FromSeconds(12)
    };

    private readonly SemaphoreSlim _lock = new(1, 1);
    private VatsimTrafficAircraft[] _cache = [];
    private DateTime _lastFetch = DateTime.MinValue;

    public async Task<VatsimTrafficAircraft[]> GetAsync()
    {
        if (DateTime.UtcNow - _lastFetch < TimeSpan.FromSeconds(30))
            return _cache;

        await _lock.WaitAsync();
        try
        {
            if (DateTime.UtcNow - _lastFetch < TimeSpan.FromSeconds(30))
                return _cache;

            _lastFetch = DateTime.UtcNow;
            using var response = await Client.GetAsync(
                FeedUrl, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();
            await using var stream = await response.Content.ReadAsStreamAsync();
            using var json = await JsonDocument.ParseAsync(stream);

            if (!json.RootElement.TryGetProperty("pilots", out var entries) ||
                entries.ValueKind != JsonValueKind.Array)
                return _cache;

            static double Num(JsonElement item, string name)
            {
                return item.TryGetProperty(name, out var field) &&
                       field.ValueKind == JsonValueKind.Number &&
                       field.TryGetDouble(out var value)
                    ? value : double.NaN;
            }
            static string Text(JsonElement item, string name)
            {
                return item.TryGetProperty(name, out var field) &&
                       field.ValueKind == JsonValueKind.String
                    ? field.GetString() ?? "" : "";
            }

            var pilots = new List<VatsimTrafficAircraft>();
            foreach (var item in entries.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object) continue;
                var lat = Num(item, "latitude");
                var lon = Num(item, "longitude");
                var speed = Num(item, "groundspeed");
                var altitude = Num(item, "altitude");
                var heading = Num(item, "heading");
                var callsign = Text(item, "callsign");
                if (!double.IsFinite(lat) || !double.IsFinite(lon) ||
                    Math.Abs(lat) > 90 || Math.Abs(lon) > 180 ||
                    (lat == 0 && lon == 0) ||
                    !double.IsFinite(speed) || speed < 60 ||
                    !double.IsFinite(altitude) || !double.IsFinite(heading) ||
                    callsign.Length is < 2 or > 24)
                    continue;

                string aircraft = "", origin = "", destination = "";
                if (item.TryGetProperty("flight_plan", out var plan) &&
                    plan.ValueKind == JsonValueKind.Object)
                {
                    aircraft = Text(plan, "aircraft_short");
                    origin = Text(plan, "departure");
                    destination = Text(plan, "arrival");
                }
                pilots.Add(new VatsimTrafficAircraft(
                    callsign, lat, lon,
                    (int)Math.Clamp(altitude, -2000, 100000),
                    (int)Math.Clamp(speed, 0, 1500),
                    (int)((heading % 360 + 360) % 360),
                    aircraft, origin, destination));
                if (pilots.Count >= 5000) break;
            }
            _cache = pilots.ToArray();
            return _cache;
        }
        catch (Exception ex) when (ex is HttpRequestException or
                                   TaskCanceledException or JsonException)
        {
            // Live network traffic is optional. Never interrupt simulator tracking.
            return _cache;
        }
        finally
        {
            _lock.Release();
        }
    }

    public void Dispose() => _lock.Dispose();
}
