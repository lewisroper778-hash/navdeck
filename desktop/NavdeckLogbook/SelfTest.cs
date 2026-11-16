using System.Diagnostics;
using System.Text;

namespace NavdeckLogbook;

// "NavdeckLogbook.exe --selftest <folder>": flies a simulated Gatwick - Heathrow flight through the real
// recorder, runway database, storage and PDF code, then writes a report. Used by the automated build.
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

            // ---- runway database
            var sw = Stopwatch.StartNew();
            var db = RunwayDb.LoadEmbedded();
            log.AppendLine($"Runway database: {db.RunwayEnds:N0} runway ends loaded in {sw.ElapsedMilliseconds} ms");
            Check(db.RunwayEnds > 20000, "runway database loaded");

            var thr = db.FindEnd("EGLL", "27R") ?? throw new InvalidOperationException("EGLL 27R missing from data");
            var parkRef = db.FindEnd("EGKK", "08R") ?? throw new InvalidOperationException("EGKK 08R missing from data");

            // ---- simulated flight
            var rec = new FlightRecorder(Task.FromResult(db));
            var completed = new List<FlightRecord>();
            rec.FlightCompleted += completed.Add;
            rec.Message += m => log.AppendLine("      " + m);

            // a SimBrief-style plan with two fixes along the way
            var origin = MoveBy(parkRef.Lat, parkRef.Lon, 180, 800);
            var runwayBearing = Bearing(thr.Lat, thr.Lon, thr.OtherLat, thr.OtherLon);
            var approachStart = MoveBy(thr.Lat, thr.Lon, (runwayBearing + 180) % 360, 8000);

            double fuel = 20000;
            var clock = new DateTime(2026, 11, 16, 10, 0, 0, DateTimeKind.Utc);
            var title = "Airbus A320neo Test Livery";

            Sample S(bool ground, double gs, (double Lat, double Lon) p, double alt, double ra, double vs,
                     bool brake = false, double td = 0, bool engine = true) =>
                new(ground, gs, td, brake, (int)fuel, p.Lat, p.Lon, alt, runwayBearing, ra, vs, engine);

            void Step(Sample s, double seconds)
            {
                clock = clock.AddSeconds(seconds);
                rec.Feed(s, clock, title);
            }

            var json = """
            { "general": {"icao_airline":"BAW","flight_number":"123"}, "atc": {"callsign":"BAW123"},
              "origin": {"icao_code":"EGKK"}, "destination": {"icao_code":"EGLL"}, "aircraft": {"icaocode":"A20N"},
              "navlog": {"fix":[
                {"ident":"EGKK","pos_lat":"51.14","pos_long":"-0.19"},
                {"ident":"WILLO","pos_lat":"__LAT1__","pos_long":"__LON1__"},
                {"ident":"MIMFO","pos_lat":"__LAT2__","pos_long":"__LON2__"},
                {"ident":"EGLL","pos_lat":"51.47","pos_long":"-0.45"} ]} }
            """;

            // cruise path: take-off point to the start of the final approach
            var takeoffPoint = MoveBy(parkRef.Lat, parkRef.Lon, 80, 600);
            (double, double) Along(double f) => (
                takeoffPoint.Lat + (approachStart.Lat - takeoffPoint.Lat) * f,
                takeoffPoint.Lon + (approachStart.Lon - takeoffPoint.Lon) * f);
            var fix1 = Along(0.30);
            var fix2 = Along(0.65);
            json = json.Replace("__LAT1__", fix1.Item1.ToString("F6", System.Globalization.CultureInfo.InvariantCulture))
                       .Replace("__LON1__", fix1.Item2.ToString("F6", System.Globalization.CultureInfo.InvariantCulture))
                       .Replace("__LAT2__", fix2.Item1.ToString("F6", System.Globalization.CultureInfo.InvariantCulture))
                       .Replace("__LON2__", fix2.Item2.ToString("F6", System.Globalization.CultureInfo.InvariantCulture));

            var ofp = SimBrief.Parse(json);
            Check(ofp.Callsign == "BAW123" && ofp.Origin == "EGKK" && ofp.Destination == "EGLL", "SimBrief plan parsed");
            Check(ofp.Route.Count == 2, "SimBrief route excludes the departure and arrival airports");

            // parked at the gate
            for (var i = 0; i < 5; i++) Step(S(true, 0, origin, 200, 0, 0, brake: true), 1);
            Check(rec.Stage == Stage.Parked, "stays parked while stationary");
            rec.ApplyFlightPlan(ofp);

            // taxi out
            var pos = origin;
            for (var i = 0; i < 60; i++)
            {
                pos = MoveBy(pos.Lat, pos.Lon, 90, 8);
                Step(S(true, 15, pos, 200, 0, 0), 1);
            }
            Check(rec.Stage == Stage.TaxiOut, "gate out detected");
            Check(rec.Current.GateOutUtc is not null && rec.Current.FuelGateOutLb == 20000, "gate-out time and fuel recorded");

            // take-off roll, then climb and cruise
            for (var i = 0; i < 8; i++) Step(S(true, 60 + i * 12, takeoffPoint, 200, 0, 0), 1);
            fuel -= 150;
            for (var i = 0; i <= 108; i++)
            {
                var f = i / 108.0;
                var alt = Math.Min(5000, 200 + i * 60.0);
                fuel -= 1.1;
                Step(S(false, 250, Along(f), alt, alt, 1800), 5);
            }
            Check(rec.Stage == Stage.Airborne, "take-off detected");
            Check(rec.Current.TakeoffUtc is not null && rec.Current.FuelTakeoffLb is not null, "take-off time and fuel recorded");
            Check(rec.Current.Waypoints.Count(w => w.IsRouteFix) == 2, "both route fixes logged with time and fuel");

            // final approach to 27R, touching down 396 m past the threshold, 3 m right of the centreline
            var dir = runwayBearing;
            for (var i = 0; i < 60; i++)
            {
                var along = -8000 + i * (8396.0 / 60);
                var p = MoveBy(thr.Lat, thr.Lon, dir, along);
                var alt = Math.Max(15, 2400 - i * 40.0);
                fuel -= 0.4;
                Step(S(false, 140, p, alt, alt, -700), 2);
            }
            var touch = MoveBy(MoveBy(thr.Lat, thr.Lon, dir, 396).Lat, MoveBy(thr.Lat, thr.Lon, dir, 396).Lon, (dir + 90) % 360, 3);
            Step(S(true, 135, touch, 80, 0, -180, td: -180), 1);
            Check(rec.Stage == Stage.TaxiIn, "landing detected");

            // roll-out and taxi in
            pos = touch;
            for (var i = 0; i < 30; i++)
            {
                pos = MoveBy(pos.Lat, pos.Lon, dir, 60 - i);
                Step(S(true, Math.Max(15, 120 - i * 4), pos, 80, 0, 0), 1);
            }
            for (var i = 0; i < 120; i++)
            {
                pos = MoveBy(pos.Lat, pos.Lon, 180, 5);
                Step(S(true, 12, pos, 80, 0, 0), 5);
            }
            for (var i = 0; i < 10; i++) Step(S(true, 0, pos, 80, 0, 0, brake: true), 5);

            // ---- results
            Check(completed.Count == 1, "exactly one flight completed");
            var flight = completed.FirstOrDefault() ?? new FlightRecord();
            Check(flight.Origin == "EGKK", $"origin detected: {flight.Origin}");
            Check(flight.Destination == "EGLL", $"destination detected: {flight.Destination}");
            Check(flight.LandingRunway == "27R", $"landing runway: {flight.LandingRunway}");
            Check(flight.LandingRateFpm == 180, $"landing rate: {flight.LandingRateFpm}");
            Check(flight.TouchdownDistanceFt is { } d && Math.Abs(d - 1299) < 120, $"touchdown distance: {flight.TouchdownDistanceFt} ft");
            Check(flight.TouchdownOffsetFt is { } o && o > 4 && o < 16, $"touchdown offset: {flight.TouchdownOffsetFt} ft right");
            Check(flight.BlockTime > TimeSpan.FromMinutes(10), $"block time {Fmt.Duration(flight.BlockTime)}");
            Check(flight.AirTime > TimeSpan.FromMinutes(5), $"air time {Fmt.Duration(flight.AirTime)}");
            Check(flight.FuelBurnedLb > 100, $"fuel burned {flight.FuelBurnedLb} lb");
            Check(flight.Track.Count > 20, $"track points {flight.Track.Count}");
            Check(flight.Callsign.Length == 0 || flight.Callsign == "BAW123", "callsign kept");

            // ---- storage round trip
            var storeDir = Path.Combine(outDir, "store");
            var store = new LogbookStore(storeDir);
            store.Save(flight);
            var reloaded = store.LoadAll();
            Check(reloaded.Count == 1 && reloaded[0].LandingRunway == "27R" && reloaded[0].Waypoints.Count == flight.Waypoints.Count,
                "flight saved and reloaded from the logbook");
            Check(LogbookStore.ToCsv(reloaded, false).Contains("EGLL"), "CSV export");

            // ---- PDF export
            sw.Restart();
            var pdf = Path.Combine(outDir, "sample-flight.pdf");
            PdfExporter.Export(flight, pdf, kg: false);
            log.AppendLine($"PDF export: {sw.ElapsedMilliseconds} ms, {new FileInfo(pdf).Length:N0} bytes");
            Check(IsPdf(pdf, 8000), "PDF written");

            // a flight with no runway match, no track and many waypoints (page breaks, empty plots)
            var sparse = new FlightRecord
            {
                Origin = "EGLL", Destination = "KJFK", Callsign = "TEST1", Aircraft = "Boeing 787-9",
                GateOutUtc = clock, GateInUtc = clock.AddHours(8), FuelGateOutLb = 190000, FuelGateInLb = 61000,
            };
            for (var i = 0; i < 70; i++)
                sparse.Waypoints.Add(new WaypointLog { Ident = $"FIX{i:00}", TimeUtc = clock.AddMinutes(i * 6), AltFt = 38000, FuelLb = 185000 - i * 1700, IsRouteFix = true });
            var pdf2 = Path.Combine(outDir, "sample-sparse-long.pdf");
            PdfExporter.Export(sparse, pdf2, kg: true);
            Check(IsPdf(pdf2, 4000), "PDF written for a sparse flight with 70 waypoints (multi-page, kg)");

            // plot images for a quick look
            using (var bmp = Plots.TouchdownPlot(flight, 900, 260, PlotTheme.Dark))
                File.WriteAllBytes(Path.Combine(outDir, "touchdown-plot.png"), Plots.ToPng(bmp));
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

    private static bool IsPdf(string path, long minBytes)
    {
        if (!File.Exists(path) || new FileInfo(path).Length < minBytes) return false;
        using var fs = File.OpenRead(path);
        var head = new byte[5];
        return fs.Read(head, 0, 5) == 5 && Encoding.ASCII.GetString(head) == "%PDF-";
    }

    private static (double Lat, double Lon) MoveBy(double lat, double lon, double bearingDeg, double meters)
    {
        var b = bearingDeg * Math.PI / 180;
        return (lat + Math.Cos(b) * meters / 111195.0,
                lon + Math.Sin(b) * meters / (111195.0 * Math.Cos(lat * Math.PI / 180)));
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
}
