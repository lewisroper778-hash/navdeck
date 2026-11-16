using System.Net;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;

namespace NavdeckEfb;

// Sends each signed journey log (PDF) to the NAVDECK server, which emails it to inflightreports@navdeck.online.
// Reports wait in an outbox folder until the server accepts them, so nothing is lost when offline.
internal sealed class ReportOutbox : IDisposable
{
    public const string DefaultServer = "https://test.navdeck.online";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    private readonly Store _store;
    private readonly string _dir, _failedDir, _serverUrl;
    private readonly CancellationTokenSource _cts = new();
    private readonly SemaphoreSlim _wake = new(0);
    private readonly SemaphoreSlim _sending = new(1, 1);
    private Task? _loop;

    public Func<string, Task<byte[]>>? PdfRenderer { get; set; }

    public ReportOutbox(Store store, string? serverUrl = null)
    {
        _store = store;
        _serverUrl = (serverUrl ?? DefaultServer).TrimEnd('/');
        _dir = Path.Combine(store.DataDir, "outbox");
        _failedDir = Path.Combine(_dir, "not-sent");
        Directory.CreateDirectory(_dir);
    }

    public int Pending => Directory.EnumerateFiles(_dir, "*.json").Count();

    public void Start() => _loop = Task.Run(LoopAsync);

    // Called when a flight is signed and closed.
    public void Enqueue(JsonObject flight)
    {
        var id = new string(J.Str(flight["id"]).Where(char.IsLetterOrDigit).Take(40).ToArray());
        if (id.Length == 0) return;
        var closed = flight["closed"] as JsonObject;
        var flightNo = J.Str(flight["flightNo"]) is { Length: > 0 } n ? n : J.Str(flight["callsign"]);
        var arrival = flight["diversion"] is JsonObject d ? J.Str(d["to"]) : J.Str(flight["arr"]);
        var item = new JsonObject
        {
            ["id"] = id,
            ["flight"] = flightNo,
            ["route"] = $"{J.Str(flight["dep"])}-{arrival}",
            ["pic"] = J.Str(closed?["name"]),
            ["closedAt"] = J.Str(closed?["time"]),
            ["tries"] = 0,
            ["nextTry"] = J.Iso(DateTime.UtcNow),
        };
        File.WriteAllText(Path.Combine(_dir, id + ".json"), item.ToJsonString());
        _wake.Release();
    }

    public void Kick() => _wake.Release();

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
        if (!J.Bool(_store.Settings["sendReports"], true)) return 0;
        if (PdfRenderer is null) return 0;
        await _sending.WaitAsync(token);
        var sent = 0;
        try
        {
            foreach (var file in Directory.EnumerateFiles(_dir, "*.json").ToList())
            {
                if (JsonNode.Parse(await File.ReadAllTextAsync(file, token)) is not JsonObject item) continue;
                if (!ignoreSchedule && J.Time(item["nextTry"]) is { } next && next > DateTime.UtcNow) continue;

                var result = await TrySendAsync(item, token);
                if (result == Outcome.Sent)
                {
                    File.Delete(file);
                    sent++;
                    _store.Notify("Journey log sent", $"{J.Str(item["flight"])} {J.Str(item["route"])} was sent to NAVDECK.", "good");
                }
                else if (result == Outcome.Rejected)
                {
                    Directory.CreateDirectory(_failedDir);
                    File.Move(file, Path.Combine(_failedDir, Path.GetFileName(file)), overwrite: true);
                    _store.Notify("Journey log not sent", $"NAVDECK did not accept the report for {J.Str(item["flight"])}. Export the PDF from the Report tab instead.", "bad");
                }
                else
                {
                    var tries = (int)(J.Num(item["tries"]) ?? 0) + 1;
                    item["tries"] = tries;
                    item["nextTry"] = J.Iso(DateTime.UtcNow.AddMinutes(Math.Min(60, Math.Pow(2, Math.Min(tries, 6)))));
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

    private async Task<Outcome> TrySendAsync(JsonObject item, CancellationToken token)
    {
        byte[] pdf;
        try
        {
            pdf = await PdfRenderer!(J.Str(item["id"]));
        }
        catch (Exception)
        {
            return Outcome.RetryLater;
        }

        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(pdf);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", "journey-log.pdf");
        form.Add(new StringContent(J.Str(item["flight"])), "flight");
        form.Add(new StringContent(J.Str(item["route"])), "route");
        form.Add(new StringContent(J.Str(item["pic"])), "pic");
        form.Add(new StringContent(J.Str(item["closedAt"])), "closed_at");
        form.Add(new StringContent(EfbServer.Version), "app_version");
        form.Add(new StringContent(J.Str(item["id"])), "report_id");

        try
        {
            using var response = await Http.PostAsync(_serverUrl + "/api/efb/reports", form, token);
            if (response.IsSuccessStatusCode) return Outcome.Sent;
            return response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.RequestEntityTooLarge or HttpStatusCode.UnprocessableEntity
                ? Outcome.Rejected
                : Outcome.RetryLater;      // not set up yet, busy, rate limited or mail server down
        }
        catch (Exception) when (!token.IsCancellationRequested)
        {
            return Outcome.RetryLater;     // offline
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _loop?.Wait(2000); } catch (Exception) { }
    }
}
