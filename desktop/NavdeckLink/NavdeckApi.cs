using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace NavdeckLink;

internal sealed record FlightInfo(string Id, string? Callsign, string? Origin, string? Destination, List<RouteFix> Pending);

internal sealed class AuthException(string message) : Exception(message);

// Talks to the NAVDECK bridge API with the pairing token from the connection code
internal sealed class NavdeckApi
{
    private static readonly JsonSerializerOptions Json = new() { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull, PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
    private readonly HttpClient _http;

    public NavdeckApi(string code)
    {
        var parts = code.Trim().Split('#', 2);
        _http = new HttpClient { BaseAddress = new Uri(parts[0].TrimEnd('/') + "/api/bridge/"), Timeout = TimeSpan.FromSeconds(15) };
        _http.DefaultRequestHeaders.Add("X-Bridge-Token", parts[1]);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NavdeckLink/1.0");
    }

    public async Task<FlightInfo?> GetFlightAsync()
    {
        using var res = await _http.GetAsync("flight");
        await EnsureOk(res);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        if (!doc.RootElement.TryGetProperty("flight", out var f) || f.ValueKind != JsonValueKind.Object) return null;
        string? S(string k) => f.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var pending = new List<RouteFix>();
        if (f.TryGetProperty("waypoints", out var wps) && wps.ValueKind == JsonValueKind.Array)
            foreach (var w in wps.EnumerateArray())
                if (!w.GetProperty("done").GetBoolean() && w.GetProperty("lat").ValueKind == JsonValueKind.Number && w.GetProperty("lon").ValueKind == JsonValueKind.Number)
                    pending.Add(new RouteFix(w.GetProperty("index").GetInt32(), w.GetProperty("ident").GetString() ?? "", w.GetProperty("lat").GetDouble(), w.GetProperty("lon").GetDouble()));
        return new FlightInfo(S("id") ?? "", S("callsign"), S("origin"), S("destination"), pending);
    }

    public async Task<string[]> SendWaypointAsync(RouteFix fix, int? fuelLb, int altitudeFt)
    {
        var body = new { index = fix.Index, ident = fix.Ident, time = DateTime.UtcNow.ToString("HH:mm"), fuel_lb = fuelLb, altitude_ft = altitudeFt };
        using var res = await _http.PostAsJsonAsync("waypoint", body, Json);
        await EnsureOk(res);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("applied", out var a) ? a.EnumerateArray().Select(x => x.GetString() ?? "").ToArray() : [];
    }

    public Task HeartbeatAsync(string? aircraft, bool connected) =>
        PostAsync("heartbeat", new { sim = "MSFS (FSUIPC)", aircraft = Trim(aircraft, 120), connected });

    // Returns the fields NAVDECK filled in (empty when they were already set by hand)
    public async Task<string[]> SendEventAsync(string type, int? landingRate = null, int? fuelLb = null)
    {
        var body = new { type, time = DateTime.UtcNow.ToString("HH:mm"), landing_rate = landingRate, fuel_lb = fuelLb };
        using var res = await _http.PostAsJsonAsync("event", body, Json);
        await EnsureOk(res);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        return doc.RootElement.TryGetProperty("applied", out var a) ? a.EnumerateArray().Select(x => x.GetString() ?? "").ToArray() : [];
    }

    private async Task PostAsync(string path, object body)
    {
        using var res = await _http.PostAsJsonAsync(path, body, Json);
        await EnsureOk(res);
    }

    private static async Task EnsureOk(HttpResponseMessage res)
    {
        if (res.IsSuccessStatusCode) return;
        var detail = res.ReasonPhrase ?? "error";
        try
        {
            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            if (doc.RootElement.TryGetProperty("detail", out var d) && d.ValueKind == JsonValueKind.String) detail = d.GetString()!;
        }
        catch (JsonException) { }
        if (res.StatusCode == HttpStatusCode.Unauthorized) throw new AuthException(detail);
        throw new HttpRequestException(detail);
    }

    private static string? Trim(string? s, int max) => s is null ? null : s.Length > max ? s[..max] : s;
}
