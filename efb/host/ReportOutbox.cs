using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text.Json.Nodes;

namespace NavdeckEfb;

// Posts each signed journey log (PDF) to the NAVDECK Discord channel through a webhook.
// Reports wait in an outbox folder until Discord accepts them, so nothing is lost when offline.
// The webhook link is added at build time from a GitHub secret; it is never in the source code.
internal sealed class ReportOutbox : IDisposable
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    private readonly Store _store;
    private readonly string _dir, _failedDir;
    private readonly string? _webhook;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim _wake = new(0);
    private readonly SemaphoreSlim _sending = new(1, 1);
    private Task? _loop;

    public Func<string, Task<byte[]>>? PdfRenderer { get; set; }

    public ReportOutbox(Store store, string? webhookUrl = null, bool useBuiltIn = true)
    {
        _store = store;
        _webhook = Valid(webhookUrl) ? webhookUrl : useBuiltIn && Valid(BuiltInWebhook()) ? BuiltInWebhook() : null;
        _dir = Path.Combine(store.DataDir, "outbox");
        _failedDir = Path.Combine(_dir, "not-sent");
        Directory.CreateDirectory(_dir);
    }

    public bool Available => _webhook is not null;
    public int Pending => Directory.EnumerateFiles(_dir, "*.json").Count();

    private static bool Valid(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.IsLoopback);

    private static string? BuiltInWebhook() =>
        typeof(ReportOutbox).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(a => a.Key == "DiscordWebhook")?.Value?.Trim();

    public void Start() => _loop = Task.Run(LoopAsync);

    // Called when a flight is signed and closed.
    public bool Enqueue(JsonObject flight)
    {
        if (!Available) return false;
        var id = new string(J.Str(flight["id"]).Where(char.IsLetterOrDigit).Take(40).ToArray());
        if (id.Length == 0) return false;
        var closed = flight["closed"] as JsonObject;
        var times = flight["times"] as JsonObject;
        var fuel = flight["fuel"] as JsonObject;
        var landing = flight["landing"] as JsonObject;
        var flightNo = J.Str(flight["flightNo"]) is { Length: > 0 } n ? n : J.Str(flight["callsign"]);
        var arrival = flight["diversion"] is JsonObject d ? J.Str(d["to"]) : J.Str(flight["arr"]);
        string? block = J.Time(times?["out"]) is { } o && J.Time(times?["in"]) is { } i ? $"{(int)(i - o).TotalHours}:{(i - o).Minutes:00}" : null;
        double? burn = J.Num(fuel?["out"]) is { } a && J.Num(fuel?["in"]) is { } b ? a - b : null;
        var airlineCode = J.Str(flight["airline"]).Trim().ToUpperInvariant();
        var item = new JsonObject
        {
            ["id"] = id,
            ["airline"] = string.Join(" ", new[] { J.Str(flight["airlineName"]), airlineCode.Length > 0 ? $"({airlineCode})" : "" }.Where(x => x.Length > 0)),
            ["logo"] = AirlineLogo(airlineCode),
            ["flight"] = flightNo,
            ["route"] = $"{J.Str(flight["dep"])}-{arrival}",
            ["aircraft"] = string.Join(" ", new[] { J.Str(flight["type"]), J.Str(flight["reg"]) }.Where(x => x.Length > 0)),
            ["pic"] = J.Str(closed?["name"]),
            ["closedAt"] = J.Str(closed?["time"]),
            ["block"] = block,
            ["burnKg"] = burn,
            ["rate"] = J.Num(landing?["rate"]),
            ["diverted"] = flight["diversion"] is JsonObject,
            ["goArounds"] = (flight["goArounds"] as JsonArray)?.Count ?? 0,
            ["tries"] = 0,
            ["nextTry"] = J.Iso(DateTime.UtcNow),
        };
        File.WriteAllText(Path.Combine(_dir, id + ".json"), item.ToJsonString());
        _wake.Release();
        return true;
    }

    // Called when a safety report is closed. Safety reports are posted as a Discord message (no PDF).
    public bool EnqueueSafety(JsonObject report)
    {
        if (!Available) return false;
        var id = new string(J.Str(report["id"]).Where(char.IsLetterOrDigit).Take(40).ToArray());
        if (id.Length == 0) return false;
        var item = new JsonObject
        {
            ["kind"] = "safety",
            ["id"] = "sr" + id,
            ["reportId"] = id,
            ["flight"] = J.Str(report["number"]),
            ["route"] = J.Str(report["typeName"]),
            ["report"] = report.DeepClone(),
            ["tries"] = 0,
            ["nextTry"] = J.Iso(DateTime.UtcNow),
        };
        ((JsonObject)item["report"]!)["closed"]?.AsObject().Remove("signature");   // keep the outbox small
        File.WriteAllText(Path.Combine(_dir, "sr" + id + ".json"), item.ToJsonString());
        _wake.Release();
        return true;
    }

    private async Task LoopAsync()
    {
        var token = _cts.Token;
        while (!token.IsCancellationRequested)
        {
            try
            {
                await SendDueAsync(token);
            }
            catch (Exception) when (!token.IsCancellationRequested)
            {
                // Try again on the next pass.
            }
            try
            {
                await _wake.WaitAsync(TimeSpan.FromSeconds(60), token);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    // Sends every report whose retry time has come. Returns how many were sent.
    public async Task<int> SendDueAsync(CancellationToken token = default, bool ignoreSchedule = false)
    {
        if (!Available || PdfRenderer is null) return 0;
        if (!J.Bool(_store.Settings["sendReports"], true)) return 0;
        await _sending.WaitAsync(token);
        var sent = 0;
        try
        {
            foreach (var file in Directory.EnumerateFiles(_dir, "*.json").ToList())
            {
                if (JsonNode.Parse(await File.ReadAllTextAsync(file, token)) is not JsonObject item) continue;
                if (!ignoreSchedule && J.Time(item["nextTry"]) is { } next && next > DateTime.UtcNow) continue;

                var safety = J.Str(item["kind"]) == "safety";
                var (result, waitSeconds) = safety ? await TrySendSafetyAsync(item, token) : await TrySendAsync(item, token);
                if (result == Outcome.Sent)
                {
                    File.Delete(file);
                    sent++;
                    if (safety)
                    {
                        _store.MarkSafety(J.Str(item["reportId"]), "discord", J.Iso(DateTime.UtcNow));
                        _store.Notify("Safety report posted", $"{J.Str(item["flight"])} {J.Str(item["route"])} was sent to the NAVDECK Discord.", "good");
                    }
                    else _store.Notify("Journey log posted", $"{J.Str(item["flight"])} {J.Str(item["route"])} was sent to the NAVDECK Discord.", "good");
                }
                else if (result == Outcome.Rejected)
                {
                    Directory.CreateDirectory(_failedDir);
                    File.Move(file, Path.Combine(_failedDir, Path.GetFileName(file)), overwrite: true);
                    if (safety) _store.MarkSafety(J.Str(item["reportId"]), "discord", "failed");
                    _store.Notify("Journey log not sent", $"Discord did not accept the report for {J.Str(item["flight"])}. Export the PDF from the Report tab instead.", "bad");
                }
                else
                {
                    var tries = (int)(J.Num(item["tries"]) ?? 0) + 1;
                    var delay = waitSeconds ?? Math.Min(3600, 60 * Math.Pow(2, Math.Min(tries, 6)));
                    item["tries"] = tries;
                    item["nextTry"] = J.Iso(DateTime.UtcNow.AddSeconds(delay));
                    await File.WriteAllTextAsync(file, item.ToJsonString(), token);
                }
            }
        }
        finally
        {
            _sending.Release();
        }
        return sent;
    }

    private enum Outcome { Sent, RetryLater, Rejected }

    private static string Field(JsonObject item, string key) => J.Str(item[key]) is { Length: > 0 } v ? v : "-";

    private async Task<(Outcome, double?)> TrySendAsync(JsonObject item, CancellationToken token)
    {
        byte[] pdf;
        try
        {
            pdf = await PdfRenderer!(J.Str(item["id"]));
        }
        catch (Exception)
        {
            return (Outcome.RetryLater, null);
        }

        var title = $"Journey log {Field(item, "flight")} {Field(item, "route")}";
        var fields = new JsonArray
        {
            EmbedField("Airline", Field(item, "airline")),
            EmbedField("Flight", Field(item, "flight")),
            EmbedField("Route", Field(item, "route") + (J.Bool(item["diverted"], false) ? " (diverted)" : "")),
            EmbedField("Aircraft", Field(item, "aircraft")),
            EmbedField("Pilot in command", Field(item, "pic")),
            EmbedField("Block time", Field(item, "block")),
            EmbedField("Landing rate", J.Num(item["rate"]) is { } r ? $"{r:0} fpm" : "-"),
            EmbedField("Fuel burned", J.Num(item["burnKg"]) is { } kg ? $"{kg:N0} kg" : "-"),
            EmbedField("Go-arounds / touch-and-goes", ((int)(J.Num(item["goArounds"]) ?? 0)).ToString()),
        };
        var payload = new JsonObject
        {
            ["username"] = "NAVDECK EFB",
            ["content"] = $"**{title}**",
            ["allowed_mentions"] = new JsonObject { ["parse"] = new JsonArray() },   // never ping anyone
            ["embeds"] = new JsonArray(new JsonObject
            {
                ["title"] = title,
                ["color"] = 0xA78BFA,
                ["fields"] = fields,
                ["footer"] = new JsonObject { ["text"] = $"NAVDECK EFB {EfbServer.Version} | Signed {Field(item, "closedAt")}" },
            }),
            ["attachments"] = new JsonArray(new JsonObject { ["id"] = 0, ["filename"] = FileName(item) }),
        };
        var logo = LogoBytes(J.Str(item["logo"]));
        if (logo is not null)
        {
            ((JsonArray)payload["attachments"]!).Add(new JsonObject { ["id"] = 1, ["filename"] = "airline-logo.png" });
            ((JsonObject)((JsonArray)payload["embeds"]!)[0]!)["thumbnail"] = new JsonObject { ["url"] = "attachment://airline-logo.png" };
        }

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(payload.ToJsonString(), System.Text.Encoding.UTF8, "application/json"), "payload_json");
        var file = new ByteArrayContent(pdf);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "files[0]", FileName(item));
        if (logo is not null)
        {
            var image = new ByteArrayContent(logo);
            image.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(image, "files[1]", "airline-logo.png");
        }

        try
        {
            var url = _webhook + (_webhook!.Contains('?') ? "&" : "?") + "wait=true";
            using var response = await Http.PostAsync(url, form, token);
            if (response.IsSuccessStatusCode) return (Outcome.Sent, null);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                return (Outcome.RetryLater, response.Headers.RetryAfter?.Delta?.TotalSeconds is { } s ? Math.Max(5, s) : 60);
            return response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.RequestEntityTooLarge
                ? (Outcome.Rejected, null)
                : (Outcome.RetryLater, null);      // Discord busy, or the webhook was changed (fixed by an app update)
        }
        catch (Exception) when (!token.IsCancellationRequested)
        {
            return (Outcome.RetryLater, null);     // offline
        }
    }

    // The logo of the pilot's airline profile for this airline (Settings > Airline profiles), if there is one.
    private string? AirlineLogo(string code)
    {
        if (code.Length == 0 || _store.Settings["profiles"] is not JsonArray profiles) return null;
        foreach (var p in profiles.OfType<JsonObject>())
        {
            var logo = J.Str(p["logo"]);
            if (string.Equals(J.Str(p["icao"]).Trim(), code, StringComparison.OrdinalIgnoreCase) && logo.StartsWith("data:image/png;base64,") && logo.Length < 1_500_000)
                return logo;
        }
        return null;
    }

    private static byte[]? LogoBytes(string dataUrl)
    {
        const string prefix = "data:image/png;base64,";
        if (!dataUrl.StartsWith(prefix)) return null;
        try { return Convert.FromBase64String(dataUrl[prefix.Length..]); }
        catch (FormatException) { return null; }
    }

    private async Task<(Outcome, double?)> TrySendSafetyAsync(JsonObject item, CancellationToken token)
    {
        if (item["report"] is not JsonObject r) return (Outcome.Rejected, null);
        var flight = r["flight"] as JsonObject;
        var closed = r["closed"] as JsonObject;
        string S(JsonNode? n) => J.Str(n) is { Length: > 0 } v ? v : "-";
        var severity = J.Str(r["severity"]);
        var color = severity switch { "High" => 0xEF4444, "Medium" => 0xF59E0B, _ => 0x22C55E };
        var fields = new JsonArray
        {
            EmbedField("Report", S(r["number"])),
            EmbedField("Type", S(r["typeName"])),
            EmbedField("Severity", S(r["severity"])),
            EmbedField("Flight", S(flight?["flightNo"])),
            EmbedField("Route", $"{S(flight?["dep"])}-{S(flight?["arr"])}"),
            EmbedField("Aircraft", string.Join(" ", new[] { J.Str(flight?["type"]), J.Str(flight?["reg"]) }.Where(x => x.Length > 0)) is { Length: > 0 } ac ? ac : "-"),
            EmbedField("Reported by", S(r["openedBy"])),
            EmbedField("Opened", S(r["openedAt"]).Replace('T', ' ').Split('.')[0] + "z"),
            EmbedField("Closed", S(closed?["time"]).Replace('T', ' ').Split('.')[0] + "z"),
        };
        if (r["fields"] is JsonObject details)
            foreach (var (key, value) in details)
            {
                if (fields.Count >= 22) break;
                var text = J.Str(value);
                if (text.Length == 0) continue;
                fields.Add(EmbedField(J.Str(r["labels"]?[key]) is { Length: > 0 } l ? l : key, text));
            }
        fields.Add(new JsonObject { ["name"] = "Outcome", ["value"] = Clip(S(closed?["outcome"]), 1000), ["inline"] = false });
        if (J.Str(closed?["actions"]).Length > 0)
            fields.Add(new JsonObject { ["name"] = "Actions taken", ["value"] = Clip(J.Str(closed?["actions"]), 1000), ["inline"] = false });
        fields.Add(new JsonObject { ["name"] = "Closed by", ["value"] = S(closed?["name"]), ["inline"] = true });

        var title = $"Safety report {S(r["number"])}: {S(r["typeName"])}";
        var payload = new JsonObject
        {
            ["username"] = "NAVDECK EFB",
            ["content"] = $"**{title}**",
            ["allowed_mentions"] = new JsonObject { ["parse"] = new JsonArray() },
            ["embeds"] = new JsonArray(new JsonObject
            {
                ["title"] = Clip(J.Str(r["title"]) is { Length: > 0 } t ? $"{title} - {t}" : title, 250),
                ["description"] = Clip(J.Str(r["narrative"]), 3500),
                ["color"] = color,
                ["fields"] = fields,
                ["footer"] = new JsonObject { ["text"] = $"NAVDECK EFB {EfbServer.Version} | Safety report closed" },
            }),
        };
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(payload.ToJsonString(), System.Text.Encoding.UTF8, "application/json"), "payload_json");
        try
        {
            var url = _webhook + (_webhook!.Contains('?') ? "&" : "?") + "wait=true";
            using var response = await Http.PostAsync(url, form, token);
            if (response.IsSuccessStatusCode) return (Outcome.Sent, null);
            if (response.StatusCode == HttpStatusCode.TooManyRequests)
                return (Outcome.RetryLater, response.Headers.RetryAfter?.Delta?.TotalSeconds is { } s ? Math.Max(5, s) : 60);
            return response.StatusCode is HttpStatusCode.BadRequest ? (Outcome.Rejected, null) : (Outcome.RetryLater, null);
        }
        catch (Exception) when (!token.IsCancellationRequested)
        {
            return (Outcome.RetryLater, null);
        }
    }

    private static string Clip(string s, int max) => s.Length > max ? s[..(max - 1)] + "…" : s;

    private static JsonObject EmbedField(string name, string value) =>
        new() { ["name"] = name, ["value"] = value.Length > 1000 ? value[..1000] : value, ["inline"] = true };

    private static string FileName(JsonObject item)
    {
        var name = $"NAVDECK {J.Str(item["flight"])} {J.Str(item["route"])}".Trim();
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
        return name.Replace(' ', '_') + ".pdf";
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _loop?.Wait(2000); } catch (Exception) { }
    }
}
