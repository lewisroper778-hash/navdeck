using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace NavdeckEfb;

// "NavdeckEFB.exe --selftest <folder>": flies a simulated Gatwick - Heathrow flight through the real
// flight engine, runway database, storage and local server, then writes a report. Used by the build.
internal static class SelfTest
{
    public static int Run(string outDir)
    {
        var log = new StringBuilder();
        var ok = true;
        void Check(bool condition, string name)
        {
            log.AppendLine((condition ? "PASS  " : "FAIL  ") + name);
            if (!condition) ok = false;
        }

        try
        {
            Directory.CreateDirectory(outDir);
            var dataDir = Path.Combine(outDir, "data");
            if (Directory.Exists(dataDir)) Directory.Delete(dataDir, true);

            var sw = Stopwatch.StartNew();
            var db = RunwayDb.LoadEmbedded();
            log.AppendLine($"Runway database: {db.RunwayEnds:N0} runway ends in {sw.ElapsedMilliseconds} ms");
            Check(db.RunwayEnds > 20000, "runway database loaded");
            var thr = db.FindEnd("EGLL", "27R") ?? throw new InvalidOperationException("EGLL 27R missing");
            var gat = db.FindEnd("EGKK", "08R") ?? throw new InvalidOperationException("EGKK 08R missing");

            using var store = new Store(dataDir);
            var engine = new FlightEngine(store, Task.FromResult(db));

            // bundled QRH and FCOM manuals are added to Documents once, and a deleted one is not re-added
            var docsDir = Path.Combine(store.LibraryDir, "docs");
            var manuals = Directory.Exists(docsDir) ? Directory.GetFiles(docsDir, "*.pdf", SearchOption.AllDirectories) : Array.Empty<string>();
            Check(manuals.Count(m => m.EndsWith(" QRH.pdf")) >= 30 && manuals.Count(m => m.EndsWith(" FCOM.pdf")) >= 30, $"QRH and FCOM manuals in Documents ({manuals.Length} files)");
            var sample = manuals.FirstOrDefault(m => m.Contains("A320neo QRH"));
            Check(sample is not null, "A320neo QRH is filed under its family folder");
            if (sample is not null)
            {
                File.Delete(sample);
                Check(store.SeedManuals(Path.Combine(AppContext.BaseDirectory, "manuals")) == 0 && !File.Exists(sample), "a deleted manual is not added back");
            }

            // flight plan: two fixes on the way, then the arrival airport
            var runwayBearing = Bearing(thr.Lat, thr.Lon, thr.OtherLat, thr.OtherLon);
            var takeoffPoint = MoveBy(gat.Lat, gat.Lon, 80, 600);
            var approachStart = MoveBy(thr.Lat, thr.Lon, (runwayBearing + 180) % 360, 8000);
            (double Lat, double Lon) Along(double k) => (takeoffPoint.Lat + (approachStart.Lat - takeoffPoint.Lat) * k, takeoffPoint.Lon + (approachStart.Lon - takeoffPoint.Lon) * k);
            var f1 = Along(0.3);
            var f2 = Along(0.65);
            var flight = Store.NewFlight();
            flight["flightNo"] = "BAW123";
            flight["dep"] = "EGKK";
            flight["arr"] = "EGLL";
            flight["fuel"] = new JsonObject { ["planTakeoff"] = 9000.0, ["planLanding"] = 8300.0 };
            flight["navlog"] = new JsonArray(
                Fix("WILLO", "wpt", f1, 240, 8800),
                Fix("MIMFO", "wpt", f2, 420, 8600),
                Fix("EGLL", "apt", (thr.Lat, thr.Lon), 900, 8300));
            store.ReplaceFlight(flight);
            store.ApplyOps("settings", new JsonArray(new JsonObject { ["op"] = "set", ["path"] = new JsonArray("fuelCheckMin"), ["value"] = 5 }));

            double fuelLb = 18000;
            var clock = new DateTime(2026, 11, 16, 10, 0, 0, DateTimeKind.Utc);
            Sample S(bool ground, double gs, (double Lat, double Lon) p, double alt, double ra, double vs, bool brake = false, double td = 0) =>
                new(ground, gs, td, brake, (int)fuelLb, p.Lat, p.Lon, alt, runwayBearing, ra, vs, true);
            void Step(Sample s, double seconds)
            {
                clock = clock.AddSeconds(seconds);
                engine.Feed(s, clock, null, "Airbus A320neo");
            }
            JsonObject F() => store.Flight;
            double? Fuel(string key) => J.Num(F()["fuel"]?[key]);

            // parked, refuelled by 1,500 kg
            var gate = MoveBy(gat.Lat, gat.Lon, 180, 800);
            for (var i = 0; i < 5; i++) Step(S(true, 0, gate, 200, 0, 0, brake: true), 1);
            for (var i = 0; i < 20; i++) { fuelLb += 1500 / 0.45359237 / 20; Step(S(true, 0, gate, 200, 0, 0, brake: true), 3); }
            for (var i = 0; i < 20; i++) Step(S(true, 0, gate, 200, 0, 0, brake: true), 5);
            var receipts = F()["gsx"]?["receipts"] as JsonArray;
            Check(receipts?.Count == 1 && J.Str(receipts[0]?["type"]) == "Fuel", "fuel uplift saved as a receipt automatically");

            // taxi out, take-off, cruise, approach
            var pos = gate;
            for (var i = 0; i < 60; i++) { pos = MoveBy(pos.Lat, pos.Lon, 90, 8); Step(S(true, 15, pos, 200, 0, 0), 1); }
            Check(J.Str(F()["times"]?["out"]).Length > 0 && Fuel("out") is > 0, "off-blocks time and fuel recorded");
            for (var i = 0; i < 8; i++) Step(S(true, 60 + i * 12, takeoffPoint, 200, 0, 0), 1);
            for (var i = 0; i <= 108; i++)
            {
                fuelLb -= 6;
                var alt = Math.Min(5000, 200 + i * 60.0);
                Step(S(false, 250, Along(i / 108.0), alt, alt, 1800), 5);
            }
            Check(J.Str(F()["times"]?["off"]).Length > 0, "take-off time recorded");

            // accidental wheel contact on a low pass, then climbing away again
            var pass = MoveBy(thr.Lat, thr.Lon, runwayBearing, 900);
            Step(S(false, 140, pass, 120, 40, -300), 1);
            Step(S(true, 138, MoveBy(pass.Lat, pass.Lon, runwayBearing, 70), 80, 0, 0, td: -260), 1);
            Step(S(true, 136, MoveBy(pass.Lat, pass.Lon, runwayBearing, 140), 80, 0, 0), 1);
            for (var i = 1; i <= 6; i++) Step(S(false, 145, MoveBy(pass.Lat, pass.Lon, runwayBearing, 140 + i * 75), 80 + i * 90, i * 90, 1800), 1);
            Check(J.Str(F()["times"]?["on"]).Length == 0 && F()["landing"] is null, "an accidental touchdown is not taken as the landing");
            Check(engine.Stage == Stage.Airborne, "the flight continues after a touch-and-go");
            var tg = F()["goArounds"] as JsonArray;
            Check(tg?.Count == 1 && J.Str(tg[0]?["kind"]) == "touch-and-go", "touch-and-go recorded once (needs a reason before closing)");

            // the app is restarted in the air and picks the flight up again
            var restarted = new FlightEngine(store, Task.FromResult(db));
            restarted.Feed(S(false, 250, Along(0.99), 5000, 5000, 0), clock.AddSeconds(1), null, "Airbus A320neo");
            Check(restarted.Stage == Stage.Airborne, "a restart in the air resumes the flight");

            // a wrong landing left behind by an older version is cleared when the app starts in the air
            store.ApplyOps("flight", new JsonArray(
                new JsonObject { ["op"] = "set", ["path"] = new JsonArray("times", "on"), ["value"] = J.Iso(clock) },
                new JsonObject { ["op"] = "set", ["path"] = new JsonArray("fuel", "on"), ["value"] = 5000.0 },
                new JsonObject { ["op"] = "set", ["path"] = new JsonArray("landing"), ["value"] = new JsonObject { ["rate"] = 90 } }));
            var updated = new FlightEngine(store, Task.FromResult(db));
            updated.Feed(S(false, 250, Along(0.99), 5000, 5000, 0), clock.AddSeconds(2), null, "Airbus A320neo");
            Check(updated.Stage == Stage.Airborne && J.Str(F()["times"]?["on"]).Length == 0 && F()["landing"] is null && J.Num(F()["fuel"]?["on"]) is null,
                "a stale landing is cleared automatically when the app starts in the air");
            var nav = (JsonArray)F()["navlog"]!;
            Check(J.Str(nav[0]?["ata"]).Length > 0 && J.Str(nav[1]?["ata"]).Length > 0, "both fixes passed with a time");
            Check(J.Num(nav[0]?["fob"]) is > 0 && J.Num(nav[1]?["fob"]) is > 0, "fuel on board logged at each fix");
            Check(J.Str(nav[2]?["ata"]).Length == 0, "arrival airport not marked before landing");
            Check((F()["fuelChecks"] as JsonArray)?.Count >= 1, "automatic fuel check recorded");

            for (var i = 0; i < 60; i++)
            {
                var p = MoveBy(thr.Lat, thr.Lon, runwayBearing, -8000 + i * (8396.0 / 60));
                var alt = Math.Max(15, 2400 - i * 40.0);
                Step(S(false, 140, p, alt, alt, -700), 2);
            }
            var touchCentre = MoveBy(thr.Lat, thr.Lon, runwayBearing, 396);
            var touch = MoveBy(touchCentre.Lat, touchCentre.Lon, (runwayBearing + 90) % 360, 3);
            Step(S(true, 135, touch, 80, 0, -180, td: -180), 1);
            pos = touch;
            for (var i = 0; i < 30; i++) { pos = MoveBy(pos.Lat, pos.Lon, runwayBearing, 60 - i); Step(S(true, Math.Max(15, 120 - i * 4), pos, 80, 0, 0), 1); }

            var landing = F()["landing"] as JsonObject;
            Check(J.Time(F()["times"]?["on"]) is { } onTime && onTime < clock.AddSeconds(-20), "landing time is the moment of touchdown, not when it was confirmed");
            Check(J.Num(landing?["rate"]) == 180, $"landing rate {J.Num(landing?["rate"])}");
            Check(J.Str(landing?["runway"]) == "27R" && J.Str(landing?["airport"]) == "EGLL", $"runway {J.Str(landing?["runway"])} {J.Str(landing?["airport"])}");
            Check(J.Num(landing?["distFt"]) is { } dist && Math.Abs(dist - 1299) < 120, $"touchdown {J.Num(landing?["distFt"])} ft from threshold");
            Check(J.Num(landing?["offsetFt"]) is { } off && off > 4 && off < 16, $"touchdown {J.Num(landing?["offsetFt"])} ft right of centreline");
            Check(J.Str(nav[2]?["ata"]).Length > 0, "arrival airport gets the landing time and fuel");

            for (var i = 0; i < 60; i++) { pos = MoveBy(pos.Lat, pos.Lon, 180, 5); Step(S(true, 12, pos, 80, 0, 0), 5); }
            for (var i = 0; i < 10; i++) Step(S(true, 0, pos, 80, 0, 0, brake: true), 5);
            Check(J.Str(F()["times"]?["in"]).Length > 0 && Fuel("in") is > 0, "on-blocks time and fuel recorded");
            Check(Fuel("out") > Fuel("in"), "fuel burned is positive");

            // closing rules
            lock (store.Gate)
                ((JsonArray)F()["goArounds"]!).Add(new JsonObject { ["time"] = J.Iso(clock), ["raFt"] = 400.0, ["reason"] = "" });
            Check(store.CloseFlight() is not null, "cannot close before signing");
            store.ApplyOps("flight", new JsonArray(new JsonObject { ["op"] = "set", ["path"] = new JsonArray("closed"), ["value"] = new JsonObject { ["name"] = "TEST", ["signature"] = "data:image/png;base64,AA==", ["time"] = J.Iso(clock) } }));
            Check(store.CloseFlight() is { } why && why.Contains("go-around"), "cannot close while a go-around reason is missing");
            store.ApplyOps("flight", new JsonArray(new JsonObject { ["op"] = "set", ["path"] = new JsonArray("goArounds", 0, "reason"), ["value"] = "Accidental touchdown" }));
            Check(store.CloseFlight() is { } stillMissing && stillMissing.Contains("go-around"), "every go-around and touch-and-go needs a reason");
            store.ApplyOps("flight", new JsonArray(new JsonObject { ["op"] = "set", ["path"] = new JsonArray("goArounds", 1, "reason"), ["value"] = "Unstable approach" }));
            Check(store.CloseFlight() is { } needsReport && needsReport.Contains("safety report") && needsReport.Contains("go-around"), "a go-around makes a safety report mandatory before closing");
            {
                string flightId;
                lock (store.Gate) flightId = J.Str(store.Flight["id"]);
                var ga = store.OpenSafety(new JsonObject
                {
                    ["type"] = "unstable", ["typeName"] = "Unstable approach / go-around", ["openedBy"] = "TEST",
                    ["flight"] = new JsonObject { ["id"] = flightId, ["flightNo"] = "BAW123" },
                }, clock);
                Check(store.CloseFlight() is { } stillOpen && stillOpen.Contains("safety report"), "an open (not closed) safety report is not enough");
                store.ApplyOps("safety", new JsonArray(
                    new JsonObject { ["op"] = "set", ["path"] = new JsonArray("reports", J.Str(ga["id"]), "severity"), ["value"] = "Low" },
                    new JsonObject { ["op"] = "set", ["path"] = new JsonArray("reports", J.Str(ga["id"]), "narrative"), ["value"] = "Unstable at 1000 ft, went around." }));
                Check(store.CloseSafety(J.Str(ga["id"]), new JsonObject { ["name"] = "TEST", ["outcome"] = "No further action" }, clock, out _) is null, "go-around safety report closed");
                var hard = new JsonObject { ["id"] = "x1", ["goArounds"] = new JsonArray(), ["landing"] = new JsonObject { ["rate"] = 650 }, ["fuel"] = new JsonObject { ["on"] = 1400.0 } };
                List<Store.RequiredReport> need;
                lock (store.Gate) need = store.RequiredSafety(hard);
                Check(need.Select(n => n.Type).SequenceEqual(new[] { "hardlanding", "fuel" }), "hard landing (600 fpm) and landing below 1,500 kg need a report");
            }
            Check(store.CloseFlight() is null, "closes once signed, the reason is entered and the safety report is closed");
            Check(store.History.Count == 1, "closed flight added to the logbook");

            // journey log is posted to the Discord webhook (a stand-in here): first Discord is busy, then it accepts
            {
                var port = 18700 + Environment.ProcessId % 200;
                using var listener = new System.Net.HttpListener();
                listener.Prefixes.Add($"http://localhost:{port}/");
                listener.Start();
                var bodies = new List<string>();
                var answers = new Queue<int>(new[] { 503, 200 });
                var serving = Task.Run(async () =>
                {
                    while (listener.IsListening)
                    {
                        System.Net.HttpListenerContext ctx;
                        try { ctx = await listener.GetContextAsync(); } catch (Exception) { return; }
                        using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.Latin1))
                            lock (bodies) bodies.Add(ctx.Request.Url?.PathAndQuery + "\n" + reader.ReadToEnd());
                        ctx.Response.StatusCode = answers.Count > 0 ? answers.Dequeue() : 200;
                        ctx.Response.Close();
                    }
                });
                using var noWebhook = new ReportOutbox(store, "not a link", useBuiltIn: false);
                JsonObject probe;
                lock (store.Gate) probe = (JsonObject)store.Flight.DeepClone();
                Check(!noWebhook.Available && !noWebhook.Enqueue(probe), "an app built without the Discord link does not queue reports");
                foreach (var f in Directory.EnumerateFiles(Path.Combine(dataDir, "outbox"), "*.json")) File.Delete(f);

                using var outbox = new ReportOutbox(store, $"http://localhost:{port}/api/webhooks/123/token")
                {
                    PdfRenderer = _ => Task.FromResult(Encoding.ASCII.GetBytes("%PDF-1.7 selftest journey log")),
                };
                JsonObject closedFlight;
                lock (store.Gate) closedFlight = (JsonObject)store.Flight.DeepClone();
                outbox.Enqueue(closedFlight);
                Check(outbox.Pending == 1, "closed flight's journey log queued for the NAVDECK Discord");
                var first = outbox.SendDueAsync().GetAwaiter().GetResult();
                Check(first == 0 && outbox.Pending == 1, "kept in the outbox while Discord is busy");
                var second = outbox.SendDueAsync(ignoreSchedule: true).GetAwaiter().GetResult();
                Check(second == 1 && outbox.Pending == 0, "posted once Discord accepts it");
                string last;
                lock (bodies) last = bodies.Count > 0 ? bodies[^1] : "";
                Check(last.StartsWith("/api/webhooks/123/token?wait=true") && last.Contains("payload_json") && last.Contains("files[0]") &&
                      last.Contains("%PDF-1.7 selftest journey log") && last.Contains("BAW123") && last.Contains("EGKK-EGLL"),
                    "Discord message carries the PDF, flight and route");
                Check(last.Contains("\"allowed_mentions\":{\"parse\":[]}"), "the message can never ping anyone");

                // safety reports: opened, completed, closed (locked), then posted to Discord
                var sr = store.OpenSafety(new JsonObject
                {
                    ["type"] = "birdstrike", ["typeName"] = "Bird strike", ["openedBy"] = "TEST",
                    ["flight"] = new JsonObject { ["flightNo"] = "BAW123", ["dep"] = "EGKK", ["arr"] = "EGLL" },
                    ["labels"] = new JsonObject { ["phase"] = "Phase of flight" }, ["required"] = new JsonArray("phase"),
                }, clock);
                var srId = J.Str(sr["id"]);
                Check(J.Str(sr["number"]).StartsWith("SR-") && J.Str(sr["status"]) == "open", "safety report opened with a number");
                var closure = new JsonObject { ["name"] = "TEST", ["outcome"] = "No further action" };
                Check(store.CloseSafety(srId, closure, clock, out _) is { } srWhy && srWhy.Contains("Phase of flight") && srWhy.Contains("severity"), "safety report cannot close with required items missing");
                store.ApplyOps("safety", new JsonArray(
                    new JsonObject { ["op"] = "set", ["path"] = new JsonArray("reports", srId, "severity"), ["value"] = "Medium" },
                    new JsonObject { ["op"] = "set", ["path"] = new JsonArray("reports", srId, "narrative"), ["value"] = "Two gulls struck the radome on the climb out." },
                    new JsonObject { ["op"] = "set", ["path"] = new JsonArray("reports", srId, "fields", "phase"), ["value"] = "Initial climb" }));
                Check(store.CloseSafety(srId, closure, clock, out var srClosed) is null && srClosed is not null, "safety report closes once complete");
                store.ApplyOps("safety", new JsonArray(new JsonObject { ["op"] = "set", ["path"] = new JsonArray("reports", srId, "narrative"), ["value"] = "changed" }));
                store.ApplyOps("safety", new JsonArray(new JsonObject { ["op"] = "del", ["path"] = new JsonArray("reports", srId) }));
                bool srLocked;
                lock (store.Gate) srLocked = J.Str(store.Safety["reports"]?[srId]?["narrative"]).StartsWith("Two gulls");
                Check(srLocked, "a closed safety report cannot be edited or deleted");
                Check(outbox.EnqueueSafety(srClosed!) && outbox.SendDueAsync(ignoreSchedule: true).GetAwaiter().GetResult() == 1, "closed safety report posted to Discord");
                lock (bodies) last = bodies.Count > 0 ? bodies[^1] : "";
                Check(last.Contains("Safety report SR-") && last.Contains("Bird strike") && last.Contains("Two gulls") && last.Contains("Initial climb"), "Discord message carries the safety report");
                bool srPosted;
                lock (store.Gate) srPosted = J.Time(store.Safety["reports"]?[srId]?["discord"]) is not null;
                Check(srPosted, "report marked as posted");
                listener.Stop();
                serving.Wait(2000);
            }

            // local server answers
            var server = new EfbServer(store, engine);
            server.StartAsync(18640).GetAwaiter().GetResult();
            using (var http = new HttpClient())
            {
                var state = http.GetStringAsync($"http://127.0.0.1:{server.Port}/api/state").GetAwaiter().GetResult();
                Check(JsonNode.Parse(state)?["flight"]?["landing"]?["runway"]?.GetValue<string>() == "27R", "local server serves the flight");
                var index = http.GetStringAsync($"http://127.0.0.1:{server.Port}/").GetAwaiter().GetResult();
                Check(index.Contains("NAVDECK EFB"), "local server serves the EFB pages");
                var id = J.Str(store.History[0]?["id"]);
                var archived = http.GetStringAsync($"http://127.0.0.1:{server.Port}/api/history/{id}").GetAwaiter().GetResult();
                Check(archived.Contains("Unstable approach"), "closed flight readable from the logbook");
            }
            server.DisposeAsync().AsTask().Wait(3000);
            store.Flush();
            Check(File.Exists(Path.Combine(dataDir, "flight.json")), "flight saved to disk");
        }
        catch (Exception ex)
        {
            ok = false;
            log.AppendLine("FAIL  unexpected error: " + ex);
        }

        log.AppendLine(ok ? "ALL CHECKS PASSED" : "SELF-TEST FAILED");
        try { File.WriteAllText(Path.Combine(outDir, "selftest.txt"), log.ToString()); } catch (Exception) { }
        return ok ? 0 : 1;
    }

    private static JsonObject Fix(string ident, string type, (double Lat, double Lon) p, double planT, double planFob) => new()
    {
        ["ident"] = ident, ["type"] = type, ["lat"] = p.Lat, ["lon"] = p.Lon, ["planT"] = planT, ["planFob"] = planFob,
    };

    private static (double Lat, double Lon) MoveBy(double lat, double lon, double bearingDeg, double meters)
    {
        var b = bearingDeg * Math.PI / 180;
        return (lat + Math.Cos(b) * meters / 111195.0, lon + Math.Sin(b) * meters / (111195.0 * Math.Cos(lat * Math.PI / 180)));
    }

    private static double Bearing(double lat1, double lon1, double lat2, double lon2)
    {
        var a = lat1 * Math.PI / 180;
        var b = lat2 * Math.PI / 180;
        var d = (lon2 - lon1) * Math.PI / 180;
        var y = Math.Sin(d) * Math.Cos(b);
        var x = Math.Cos(a) * Math.Sin(b) - Math.Sin(a) * Math.Cos(b) * Math.Cos(d);
        return (Math.Atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
}
