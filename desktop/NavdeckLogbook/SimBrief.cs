using System.Globalization;
using System.Text.Json;

namespace NavdeckLogbook;

internal sealed record OfpInfo(
    string Callsign, string Origin, string Destination, string Aircraft, List<RouteFix> Route);

// Optional: reads the latest SimBrief flight plan straight from SimBrief so route fixes get logged by name.
// The logbook works without it (it then records a position checkpoint every 15 minutes).
internal static class SimBrief
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };

    public static async Task<OfpInfo> FetchAsync(string userOrId, CancellationToken ct = default)
    {
        userOrId = userOrId.Trim();
        if (userOrId.Length == 0) throw new ArgumentException("No SimBrief username set.");

        var key = userOrId.All(char.IsDigit) ? "userid" : "username";
        var url = $"https://www.simbrief.com/api/xml.fetcher.php?{key}={Uri.EscapeDataString(userOrId)}&json=1";
        using var response = await Http.GetAsync(url, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("SimBrief did not return a flight plan for that user.");
        return Parse(text);
    }

    public static OfpInfo Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var origin = Str(Obj(root, "origin"), "icao_code");
        var dest = Str(Obj(root, "destination"), "icao_code");
        var general = Obj(root, "general");
        var callsign = Str(Obj(root, "atc"), "callsign");
        if (callsign.Length == 0)
            callsign = Str(general, "icao_airline") + Str(general, "flight_number");
        var aircraft = Str(Obj(root, "aircraft"), "icaocode");

        var route = new List<RouteFix>();
        var navlog = Obj(root, "navlog");
        if (navlog.ValueKind == JsonValueKind.Object &&
            navlog.TryGetProperty("fix", out var fixes))
        {
            var items = fixes.ValueKind == JsonValueKind.Array
                ? fixes.EnumerateArray().ToList()
                : new List<JsonElement> { fixes };
            var index = 0;
            foreach (var fix in items)
            {
                var ident = Str(fix, "ident");
                if (!Dbl(fix, "pos_lat", out var lat) || !Dbl(fix, "pos_long", out var lon)) { index++; continue; }
                var isFirst = index == 0;
                var isLast = index == items.Count - 1;
                index++;
                // The departure and arrival airports are not "passed" like fixes along the route.
                if ((isFirst && ident == origin) || (isLast && ident == dest)) continue;
                route.Add(new RouteFix(index, ident, lat, lon));
            }
        }
        return new OfpInfo(callsign, origin, dest, aircraft, route);
    }

    private static JsonElement Obj(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) ? v : default;

    private static string Str(JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return "";
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString() ?? "",
            JsonValueKind.Number => v.GetRawText(),
            _ => "",
        };
    }

    private static bool Dbl(JsonElement e, string name, out double value)
    {
        value = 0;
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return false;
        if (v.ValueKind == JsonValueKind.Number) return v.TryGetDouble(out value);
        return v.ValueKind == JsonValueKind.String &&
               double.TryParse(v.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out value);
    }
}
