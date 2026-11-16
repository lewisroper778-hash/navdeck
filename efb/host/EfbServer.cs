using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;

namespace NavdeckEfb;

// The small web server inside the app. The Windows window and any tablet on the same network
// load the same pages from it and stay in step through /api/events.
internal sealed class EfbServer : IAsyncDisposable
{
    public const string Version = "1.2.0";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly Store _store;
    private readonly FlightEngine _engine;
    private WebApplication? _app;
    private readonly SemaphoreSlim _vatsimLock = new(1, 1);
    private string? _vatsimJson;
    private DateTime _vatsimAt = DateTime.MinValue;

    public int Port { get; private set; }
    public Func<string, Task<byte[]>>? PdfRenderer { get; set; }
    public ReportOutbox? Outbox { get; set; }

    public EfbServer(Store store, FlightEngine engine)
    {
        _store = store;
        _engine = engine;
    }

    public async Task StartAsync(int preferredPort = 8640)
    {
        Exception? lastError = null;
        for (var port = preferredPort; port < preferredPort + 12; port++)
        {
            try
            {
                var app = Build(port);
                await app.StartAsync();
                _app = app;
                Port = port;
                return;
            }
            catch (Exception ex)
            {
                lastError = ex;        // port in use: try the next one
            }
        }
        throw new InvalidOperationException("No free network port for the EFB server.", lastError);
    }

    public IReadOnlyList<string> LanUrls()
    {
        var list = new List<string>();
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up || nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var a in nic.GetIPProperties().UnicastAddresses)
                    if (a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address) && !a.Address.ToString().StartsWith("169.254."))
                        list.Add($"http://{a.Address}:{Port}");
            }
        }
        catch (Exception)
        {
            // Network details are only a convenience.
        }
        return list;
    }

    private WebApplication Build(int port)
    {
        var webDir = Path.Combine(AppContext.BaseDirectory, "web");
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = AppContext.BaseDirectory });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(o =>
        {
            o.ListenAnyIP(port);
            o.Limits.MaxRequestBodySize = 1024L * 1024 * 1024;    // large manuals
        });
        var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            try
            {
                await next();
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (!ctx.Response.HasStarted) await Json(ctx, new JsonObject { ["error"] = ex.Message }, 500);
            }
        });

        if (Directory.Exists(webDir))
        {
            var files = new PhysicalFileProvider(webDir);
            app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
            app.UseStaticFiles(new StaticFileOptions { FileProvider = files });
        }
        app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = new PhysicalFileProvider(_store.LibraryDir),
            RequestPath = "/lib",
            ServeUnknownFileTypes = true,
        });

        app.MapGet("/api/state", ctx =>
        {
            JsonObject body;
            lock (_store.Gate)
            {
                body = new JsonObject
                {
                    ["flight"] = _store.Flight.DeepClone(),
                    ["settings"] = _store.Settings.DeepClone(),
                    ["library"] = _store.Library.DeepClone(),
                    ["history"] = _store.History.DeepClone(),
                    ["sim"] = _engine.Telemetry,
                    ["info"] = new JsonObject
                    {
                        ["version"] = Version,
                        ["outbox"] = Outbox?.Pending ?? 0,
                        ["reportsAvailable"] = Outbox?.Available ?? false,
                        ["urls"] = new JsonArray(LanUrls().Select(u => (JsonNode?)JsonValue.Create(u)).ToArray()),
                    },
                };
            }
            return Json(ctx, body);
        });

        app.MapGet("/api/events", async ctx =>
        {
            ctx.Response.Headers.ContentType = "text/event-stream";
            ctx.Response.Headers.CacheControl = "no-cache";
            var channel = _store.Subscribe();
            try
            {
                await ctx.Response.WriteAsync(": connected\n\n", ctx.RequestAborted);
                await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
                await foreach (var message in channel.Reader.ReadAllAsync(ctx.RequestAborted))
                {
                    await ctx.Response.WriteAsync("data: " + message + "\n\n", ctx.RequestAborted);
                    await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
                }
            }
            catch (OperationCanceledException)
            {
                // The screen was closed.
            }
            finally
            {
                _store.Unsubscribe(channel);
            }
        });

        app.MapPost("/api/patch", async ctx =>
        {
            var body = await Body(ctx);
            var doc = J.Str(body?["doc"]);
            if (body?["ops"] is not JsonArray ops || doc is not ("flight" or "settings" or "library"))
            {
                await Json(ctx, new JsonObject { ["error"] = "Bad request" }, 400);
                return;
            }
            _store.ApplyOps(doc, ops);
            await Json(ctx, new JsonObject { ["ok"] = true });
        });

        app.MapPost("/api/flight/new", async ctx =>
        {
            var body = await Body(ctx);
            if (body?["flight"] is not JsonObject flight)
            {
                await Json(ctx, new JsonObject { ["error"] = "Bad request" }, 400);
                return;
            }
            _store.ReplaceFlight((JsonObject)flight.DeepClone());
            await Json(ctx, new JsonObject { ["ok"] = true });
        });

        app.MapPost("/api/flight/close", async ctx =>
        {
            var error = _store.CloseFlight();
            var sending = false;
            if (error is null && Outbox is not null && J.Bool(_store.Settings["sendReports"], true))
            {
                JsonObject closed;
                lock (_store.Gate) closed = (JsonObject)_store.Flight.DeepClone();
                sending = Outbox.Enqueue(closed);
            }
            if (error is null) await Json(ctx, new JsonObject { ["ok"] = true, ["sending"] = sending });
            else await Json(ctx, new JsonObject { ["error"] = error }, 400);
        });

        app.MapPost("/api/flight/undo-landing", async ctx =>
        {
            var error = _engine.UndoLanding();
            if (error is null) await Json(ctx, new JsonObject { ["ok"] = true });
            else await Json(ctx, new JsonObject { ["error"] = error }, 400);
        });

        app.MapGet("/api/history/{id}", async ctx =>
        {
            var json = _store.ReadArchived((string?)ctx.Request.RouteValues["id"] ?? "");
            if (json is null) await Json(ctx, new JsonObject { ["error"] = "Flight not found" }, 404);
            else await Text(ctx, json);
        });

        app.MapDelete("/api/history/{id}", async ctx =>
        {
            _store.DeleteArchived((string?)ctx.Request.RouteValues["id"] ?? "");
            await Json(ctx, new JsonObject { ["ok"] = true });
        });

        app.MapGet("/api/simbrief", async ctx =>
        {
            var user = ctx.Request.Query["user"].ToString().Trim();
            if (user.Length == 0)
            {
                await Json(ctx, new JsonObject { ["error"] = "No SimBrief username set." }, 400);
                return;
            }
            var key = user.All(char.IsDigit) ? "userid" : "username";
            using var response = await Http.GetAsync($"https://www.simbrief.com/api/xml.fetcher.php?{key}={Uri.EscapeDataString(user)}&json=1", ctx.RequestAborted);
            var text = await response.Content.ReadAsStringAsync(ctx.RequestAborted);
            if (!response.IsSuccessStatusCode || !text.TrimStart().StartsWith('{'))
                await Json(ctx, new JsonObject { ["error"] = "SimBrief did not return a flight plan for that user." }, 502);
            else await Text(ctx, text);
        });

        app.MapGet("/api/vatsim", async ctx =>
        {
            try
            {
                await Text(ctx, await VatsimAsync(ctx.RequestAborted));
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ctx.RequestAborted.IsCancellationRequested)
            {
                await Json(ctx, new JsonObject { ["error"] = "VATSIM is not reachable right now." }, 502);
            }
        });

        app.MapGet("/api/gsx/probe", async ctx =>
        {
            var host = ctx.Request.Query["host"].ToString();
            if (host.Length == 0) host = "127.0.0.1";
            int.TryParse(ctx.Request.Query["port"].ToString(), out var port);
            var found = 0;
            foreach (var candidate in new[] { port, 8380 }.Where(p => p is > 0 and < 65536).Distinct())
            {
                try
                {
                    using var probe = new HttpClient { Timeout = TimeSpan.FromSeconds(1.5) };
                    using var r = await probe.GetAsync($"http://{host}:{candidate}/", ctx.RequestAborted);
                    found = candidate;
                    break;
                }
                catch (Exception) when (!ctx.RequestAborted.IsCancellationRequested)
                {
                    // nothing listening on this port
                }
            }
            await Json(ctx, new JsonObject { ["ok"] = found > 0, ["port"] = found });
        });

        app.MapGet("/api/lib/list", async ctx =>
        {
            var root = LibraryRoot(ctx.Request.Query["kind"].ToString());
            var list = new JsonArray();
            if (root is not null && Directory.Exists(root))
            {
                foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
                {
                    var info = new FileInfo(file);
                    list.Add(new JsonObject
                    {
                        ["path"] = Path.GetRelativePath(root, file).Replace('\\', '/'),
                        ["size"] = info.Length,
                        ["modified"] = J.Iso(info.LastWriteTimeUtc),
                    });
                }
            }
            await Text(ctx, list.ToJsonString());
        });

        app.MapPut("/api/lib/file", async ctx =>
        {
            var full = LibraryPath(ctx.Request.Query["kind"].ToString(), ctx.Request.Query["path"].ToString());
            if (full is null || !IsAllowedFile(full))
            {
                await Json(ctx, new JsonObject { ["error"] = "Only PDF, JPG and PNG files can be added." }, 400);
                return;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(full)!);
            var tmp = full + ".uploading";
            await using (var target = File.Create(tmp))
                await ctx.Request.Body.CopyToAsync(target, ctx.RequestAborted);
            File.Move(tmp, full, overwrite: true);
            await Json(ctx, new JsonObject { ["ok"] = true });
        });

        app.MapDelete("/api/lib/file", async ctx =>
        {
            var full = LibraryPath(ctx.Request.Query["kind"].ToString(), ctx.Request.Query["path"].ToString());
            if (full is not null && File.Exists(full)) File.Delete(full);
            await Json(ctx, new JsonObject { ["ok"] = true });
        });

        app.MapGet("/api/report.pdf", async ctx =>
        {
            if (PdfRenderer is null)
            {
                await Json(ctx, new JsonObject { ["error"] = "PDF export is not available." }, 501);
                return;
            }
            var id = new string(ctx.Request.Query["id"].ToString().Where(char.IsLetterOrDigit).Take(40).ToArray());
            var pdf = await PdfRenderer(id);
            ctx.Response.ContentType = "application/pdf";
            ctx.Response.Headers.ContentDisposition = "attachment; filename=\"NAVDECK journey log.pdf\"";
            await ctx.Response.Body.WriteAsync(pdf, ctx.RequestAborted);
        });

        return app;
    }

    // The VATSIM network feed, trimmed to what the Live section shows. Fetched at most every 15 seconds.
    private async Task<string> VatsimAsync(CancellationToken token)
    {
        if (_vatsimJson is { } fresh && DateTime.UtcNow - _vatsimAt < TimeSpan.FromSeconds(15)) return fresh;
        await _vatsimLock.WaitAsync(token);
        try
        {
            if (_vatsimJson is { } again && DateTime.UtcNow - _vatsimAt < TimeSpan.FromSeconds(15)) return again;
            try
            {
                using var response = await Http.GetAsync("https://data.vatsim.net/v3/vatsim-data.json", token);
                response.EnsureSuccessStatusCode();
                await using var stream = await response.Content.ReadAsStreamAsync(token);
                using var doc = await System.Text.Json.JsonDocument.ParseAsync(stream, cancellationToken: token);
                var pilots = new JsonArray();
                if (doc.RootElement.TryGetProperty("pilots", out var list))
                {
                    foreach (var p in list.EnumerateArray())
                    {
                        string S(System.Text.Json.JsonElement e, string name) =>
                            e.ValueKind == System.Text.Json.JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString() ?? "" : "";
                        double N(string name) =>
                            p.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number ? v.GetDouble() : 0;
                        var plan = p.TryGetProperty("flight_plan", out var fp) ? fp : default;
                        pilots.Add(new JsonObject
                        {
                            ["cid"] = N("cid"),
                            ["callsign"] = S(p, "callsign"),
                            ["name"] = S(p, "name"),
                            ["lat"] = N("latitude"),
                            ["lon"] = N("longitude"),
                            ["alt"] = N("altitude"),
                            ["gs"] = N("groundspeed"),
                            ["hdg"] = N("heading"),
                            ["dep"] = S(plan, "departure"),
                            ["arr"] = S(plan, "arrival"),
                            ["aircraft"] = S(plan, "aircraft_short"),
                        });
                    }
                }
                var updated = doc.RootElement.TryGetProperty("general", out var general) ? S2(general, "update_timestamp") : "";
                _vatsimJson = new JsonObject { ["updated"] = updated, ["fetched"] = J.Iso(DateTime.UtcNow), ["pilots"] = pilots }.ToJsonString();
                _vatsimAt = DateTime.UtcNow;
            }
            catch (Exception) when (_vatsimJson is not null && !token.IsCancellationRequested)
            {
                // Keep showing the last good data; try again on the next request.
                _vatsimAt = DateTime.UtcNow - TimeSpan.FromSeconds(10);
            }
            return _vatsimJson ?? throw new InvalidOperationException("VATSIM data unavailable");
        }
        finally
        {
            _vatsimLock.Release();
        }
    }

    private static string S2(System.Text.Json.JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString() ?? "" : "";

    private string? LibraryRoot(string kind) =>
        kind == "docs" ? Path.Combine(_store.LibraryDir, kind) : null;

    // Keeps uploads and deletes inside the library folder.
    private string? LibraryPath(string kind, string relative)
    {
        var root = LibraryRoot(kind);
        if (root is null || string.IsNullOrWhiteSpace(relative)) return null;
        var parts = relative.Replace('\\', '/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0 || parts.Length > 6) return null;
        var invalid = Path.GetInvalidFileNameChars();
        foreach (var part in parts)
            if (part is "." or ".." || part.IndexOfAny(invalid) >= 0) return null;
        var full = Path.GetFullPath(Path.Combine(new[] { root }.Concat(parts).ToArray()));
        return full.StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    private static bool IsAllowedFile(string path) =>
        Path.GetExtension(path).ToLowerInvariant() is ".pdf" or ".png" or ".jpg" or ".jpeg";

    private static async Task<JsonObject?> Body(HttpContext ctx)
    {
        try
        {
            using var reader = new StreamReader(ctx.Request.Body);
            return JsonNode.Parse(await reader.ReadToEndAsync(ctx.RequestAborted)) as JsonObject;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static Task Json(HttpContext ctx, JsonObject body, int status = 200) => Text(ctx, body.ToJsonString(), status);

    private static Task Text(HttpContext ctx, string json, int status = 200)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        return ctx.Response.WriteAsync(json, ctx.RequestAborted);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                await _app.StopAsync(cts.Token);
            }
            catch (Exception) { }
            await _app.DisposeAsync();
        }
    }
}
