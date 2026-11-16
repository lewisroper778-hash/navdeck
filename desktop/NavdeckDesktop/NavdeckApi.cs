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

    // Desktop-only cloud requests use the same revocable pairing token as
    // telemetry. Never forward the token to the local HTML interface.
    public async Task<JsonElement> RequestDesktopAsync(
        string action, JsonElement? payload = null)
    {
        string flightId = "";
        if (action is "getFlightDetails" or "flightAction")
        {
            if (payload is not { } info ||
                info.ValueKind != JsonValueKind.Object ||
                !info.TryGetProperty("flight_id", out var id) ||
                id.ValueKind != JsonValueKind.String ||
                !Guid.TryParse(id.GetString(), out var flightGuid))
                throw new ArgumentException("Invalid flight identifier");

            flightId = Uri.EscapeDataString(flightGuid.ToString());
        }

        string path = action switch
        {
            "getFlight" => "flight",
            "getFlights" => "desktop/flights",
            "getLogbook" => "desktop/logbook",
            "getProfile" => "desktop/profile",
            "saveProfile" => "desktop/profile",
            "importSimbrief" => "desktop/import",
            "getFlightDetails" => $"desktop/flights/{flightId}",
            "flightAction" => $"desktop/flights/{flightId}/action",
            _ => throw new ArgumentException("Unsupported desktop request")
        };

        using var request = new HttpRequestMessage(
            action == "saveProfile" ? HttpMethod.Put :
            action is "importSimbrief" or "flightAction"
                ? HttpMethod.Post : HttpMethod.Get,
            path);

        if (action == "saveProfile")
        {
            if (payload is not { } p || p.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("Missing profile update fields");

            var update = new Dictionary<string, object?>();
            foreach (var key in new[] { "simbrief_pilot_id", "display_name" })
            {
                if (!p.TryGetProperty(key, out var field))
                    continue;
                if (field.ValueKind == JsonValueKind.Null)
                    update[key] = null;
                else if (field.ValueKind == JsonValueKind.String)
                    update[key] = field.GetString();
                else
                    throw new ArgumentException("Invalid profile update field");
            }
            request.Content = JsonContent.Create(update);
        }

        if (action == "flightAction")
        {
            if (payload is not { } instruction ||
                !instruction.TryGetProperty("operation", out var op) ||
                op.ValueKind != JsonValueKind.String ||
                !instruction.TryGetProperty("values", out var values) ||
                values.ValueKind != JsonValueKind.Object)
                throw new ArgumentException("Invalid flight operation");

            string operation = op.GetString() ?? "";
            var allowed = new HashSet<string>(StringComparer.Ordinal)
            {
                "toggleWaypoint", "skipWaypoint", "directTo", "undoDirect",
                "saveWaypoint", "saveTimes", "saveActuals", "saveArrival",
                "signReport", "closeFlight", "reopenFlight", "resetFlight"
            };
            if (!allowed.Contains(operation))
                throw new ArgumentException("Unsupported flight operation");

            request.Content = JsonContent.Create(new
            {
                action = operation,
                payload = values
            });
        }

        using var response = await _http.SendAsync(request);
        await EnsureOk(response);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.Clone();
    }

    // Sends live aircraft data to the NAVDECK flight dashboard.
    public Task SendTelemetryAsync(Sample s)
    {
        if (!double.IsFinite(s.Lat) || s.Lat < -90 || s.Lat > 90 ||
            !double.IsFinite(s.Lon) || s.Lon < -180 || s.Lon > 180 ||
            !double.IsFinite(s.AltFt) || s.AltFt < -2000 || s.AltFt > 60000 ||
            !double.IsFinite(s.GroundSpeedKt) ||
            s.GroundSpeedKt < 0 || s.GroundSpeedKt > 1500)
            return Task.CompletedTask;

        return PostAsync("telemetry", new
        {
            lat = s.Lat,
            lon = s.Lon,
            altitude_ft = s.AltFt,
            groundspeed_kt = s.GroundSpeedKt,
            heading_deg = double.IsFinite(s.HeadingDeg)
                ? (double?)((s.HeadingDeg % 360 + 360) % 360)
                : null,
            fuel_lb = s.FuelLb >= 0 && s.FuelLb <= 2000000
                ? (double?)s.FuelLb : null
        });
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
