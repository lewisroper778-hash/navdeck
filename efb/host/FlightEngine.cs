using System.Text.Json.Nodes;

namespace NavdeckEfb;

// Writes what the simulator reports into the shared flight document:
// block times, fuel on board, each NavLog fix, the touchdown, go-arounds, fuel checks and fuel uplift.
internal sealed class FlightEngine
{
    private const double LbToKg = 0.45359237;
    private readonly Store _store;
    private readonly Task<RunwayDb> _db;
    private readonly FlightTracker _tracker = new();
    private readonly GoAroundDetector _goAround = new();

    private string _flightId = "";
    private bool _resumeChecked;
    private bool _lastOnGround = true;
    private int _fixIndex = -1;
    private double _minDist = double.MaxValue;
    private double? _nextDistNm;
    private DateTime _lastTelemetry = DateTime.MinValue;
    private double _fuelBase = double.NaN, _fuelLast = double.NaN;
    private DateTime _fuelStableSince = DateTime.MinValue;
    private JsonObject _telemetry = new() { ["connected"] = false };

    public FlightEngine(Store store, Task<RunwayDb> runwayDb)
    {
        _store = store;
        _db = runwayDb;
    }

    public Stage Stage => _tracker.Stage;
    public JsonObject Telemetry { get { lock (_store.Gate) return (JsonObject)_telemetry.DeepClone(); } }
    private RunwayDb? Db => _db.IsCompletedSuccessfully ? _db.Result : null;

    public void Disconnected()
    {
        lock (_store.Gate) _telemetry = new JsonObject { ["connected"] = false };
        _store.Broadcast(new JsonObject { ["t"] = "sim", ["d"] = new JsonObject { ["connected"] = false } });
    }

    // realUtc is passed in so the self-test can run a whole flight in a moment.
    public void Feed(Sample s, DateTime realUtc, DateTime? simUtc, string aircraft)
    {
        lock (_store.Gate)
        {
            var f = _store.Flight;
            var now = Clock(realUtc, simUtc);
            var fobKg = s.FuelLb is > 0 and <= 2_000_000 ? Math.Round(s.FuelLb * LbToKg) : (double?)null;
            var changed = false;

            // A new flight document (new plan loaded) starts the detection again.
            var id = J.Str(f["id"]);
            if (id != _flightId)
            {
                _flightId = id;
                _fixIndex = -1;
                _minDist = double.MaxValue;
                _fuelBase = _fuelLast = double.NaN;
                _goAround.Reset();
                if (_tracker.Stage is Stage.Arrived or Stage.Parked) _tracker.Reset();
                _resumeChecked = false;
            }

            var closed = f["closed"] is JsonObject;
            var times = Obj(f, "times");
            var fuel = Obj(f, "fuel");
            _lastOnGround = s.OnGround;

            // Started (or restarted) in the middle of a flight: carry on from where the flight document is.
            if (!_resumeChecked && !closed && _tracker.Stage == Stage.Parked && s.HasPosition)
            {
                _resumeChecked = true;
                var hasOut = J.Str(times["out"]).Length > 0;
                var hasOff = J.Str(times["off"]).Length > 0;
                var hasOn = J.Str(times["on"]).Length > 0;
                var hasIn = J.Str(times["in"]).Length > 0;
                var clearlyFlying = !s.OnGround && s.GroundSpeedKt > 60 &&
                                    (!double.IsFinite(s.RadioAltFt) || s.RadioAltFt > 100);
                if (hasOn && !hasIn && clearlyFlying)
                {
                    // A landing was recorded but the aircraft is flying (for example a touch-and-go logged
                    // by an older version): clear it and carry on with the flight.
                    ClearLanding(f, times, fuel);
                    hasOn = false;
                    _tracker.Resume(Stage.Airborne);
                    _store.Notify("Landing cleared", "A landing was recorded but the aircraft is still flying, so it was removed. The flight continues and the next landing is recorded.", "good");
                    _store.Touch("flight");
                }
                else if (hasOff && !hasOn && !s.OnGround) _tracker.Resume(Stage.Airborne);
                else if (hasOn && !hasIn && s.OnGround) _tracker.Resume(Stage.TaxiIn);
                else if (hasOut && !hasOff && s.OnGround) _tracker.Resume(Stage.TaxiOut);
                if (_tracker.Stage != Stage.Parked)
                    _store.Notify("Flight resumed", $"Continuing the flight in the {StageName(_tracker.Stage)} phase.");
            }

            if (!closed)
            {
                if (_tracker.Stage == Stage.Parked && J.Str(f["type"]).Length == 0 && aircraft.Length > 0 && J.Str(f["aircraftTitle"]) != aircraft)
                {
                    f["aircraftTitle"] = aircraft;
                    changed = true;
                }
                if (_tracker.Stage == Stage.Parked && J.Str(f["dep"]).Length == 0 && s.HasPosition && Db?.NearestAirport(s.Lat, s.Lon) is { } here)
                {
                    f["dep"] = here;
                    changed = true;
                }

                var ev = _tracker.Update(s, now);
                switch (ev?.Type)
                {
                    case "gateout":
                        SetIfEmpty(times, "out", J.Iso(now));
                        SetIfEmpty(fuel, "out", fobKg);
                        _store.Notify("Off blocks", $"{now:HH:mm}z recorded automatically.", "good");
                        changed = true;
                        break;
                    case "takeoff":
                        SetIfEmpty(times, "off", J.Iso(now));
                        SetIfEmpty(fuel, "off", fobKg);
                        _store.Notify("Airborne", $"Take-off {now:HH:mm}z recorded automatically.", "good");
                        changed = true;
                        break;
                    case "landing":
                        Landing(f, times, fuel, s, _tracker.TouchdownTime ?? now, fobKg);
                        changed = true;
                        break;
                    case "touchandgo":
                        TouchAndGo(f, now, "Touch-and-go detected. The flight continues; enter a reason before closing.");
                        changed = true;
                        break;
                    case "relaunch":
                        ClearLanding(f, times, fuel);
                        TouchAndGo(f, now, "Airborne again after touching down. The landing was cleared and the flight continues.");
                        changed = true;
                        break;
                    case "gatein":
                        SetIfEmpty(times, "in", J.Iso(now));
                        SetIfEmpty(fuel, "in", fobKg);
                        if (J.Str(f["arr"]).Length == 0)
                        {
                            var airport = J.Str((f["landing"] as JsonObject)?["airport"]);
                            if (airport.Length == 0 && s.HasPosition) airport = Db?.NearestAirport(s.Lat, s.Lon) ?? "";
                            if (airport.Length > 0) f["arr"] = airport;
                        }
                        _store.Notify("On blocks", $"{now:HH:mm}z. The flight is ready to sign and close.", "good");
                        changed = true;
                        break;
                }

                if (_tracker.Stage == Stage.Airborne && s.HasPosition)
                    changed |= Airborne(f, fuel, s, now, fobKg);
                else if (_tracker.Stage == Stage.Parked && s.OnGround && fobKg is { } kg)
                    changed |= Refuelling(f, fuel, s, now, kg);
            }

            if (changed) _store.Touch("flight");

            if ((realUtc - _lastTelemetry).TotalMilliseconds >= 450 || changed)
            {
                _lastTelemetry = realUtc;
                _telemetry = new JsonObject
                {
                    ["connected"] = true,
                    ["hasPosition"] = s.HasPosition,
                    ["stage"] = (int)_tracker.Stage,
                    ["lat"] = Math.Round(s.Lat, 5),
                    ["lon"] = Math.Round(s.Lon, 5),
                    ["altFt"] = Math.Round(s.AltFt),
                    ["gsKt"] = Math.Round(s.GroundSpeedKt),
                    ["vsFpm"] = double.IsFinite(s.VerticalSpeedFpm) ? Math.Round(s.VerticalSpeedFpm) : 0,
                    ["fobKg"] = fobKg ?? 0,
                    ["onGround"] = s.OnGround,
                    ["simUtc"] = simUtc is { } st ? J.Iso(st) : null,
                    ["aircraft"] = aircraft,
                    ["nextDistNm"] = _nextDistNm is { } nd ? Math.Round(nd, 1) : null,
                };
                _store.Broadcast(new JsonObject { ["t"] = "sim", ["d"] = _telemetry.DeepClone() });
            }
        }
    }

    private void TouchAndGo(JsonObject f, DateTime now, string message)
    {
        _goAround.Reset();     // the climb-out must not also count as a separate go-around
        Arr(f, "goArounds").Add(new JsonObject
        {
            ["time"] = J.Iso(now), ["raFt"] = 0.0, ["kind"] = "touch-and-go", ["reason"] = "", ["remark"] = "",
        });
        _store.Notify("Touch-and-go", message, "warn");
    }

    private static void ClearLanding(JsonObject f, JsonObject times, JsonObject fuel)
    {
        times.Remove("on");
        times.Remove("in");
        fuel.Remove("on");
        fuel.Remove("in");
        f.Remove("landing");
        if (f["navlog"] is JsonArray nav && nav.Count > 0 && nav[^1] is JsonObject last &&
            J.Str(last["type"]) == "apt" && J.Bool(last["auto"], false))
        {
            last.Remove("ata");
            last.Remove("fob");
            last.Remove("alt");
            last.Remove("auto");
        }
    }

    // "Undo landing" from the Landing tab: the recorded landing was wrong, so the flight continues.
    public string? UndoLanding()
    {
        lock (_store.Gate)
        {
            var f = _store.Flight;
            if (f["closed"] is JsonObject) return "The flight is already closed.";
            if (f["landing"] is null && J.Str(f["times"]?["on"]).Length == 0) return "No landing has been recorded.";
            ClearLanding(f, Obj(f, "times"), Obj(f, "fuel"));
            _tracker.Resume(_lastOnGround ? Stage.TaxiOut : Stage.Airborne);
            _store.Touch("flight");
            _store.Notify("Landing removed", _lastOnGround
                ? "The next take-off and landing will be recorded again."
                : "The flight continues; the next landing will be recorded.", "good");
            return null;
        }
    }

    private static string StageName(Stage s) => s switch
    {
        Stage.TaxiOut => "taxi out",
        Stage.Airborne => "airborne",
        Stage.TaxiIn => "taxi in",
        _ => s.ToString().ToLowerInvariant(),
    };

    // Real time, or the simulator's clock when it is clearly different (or always, if chosen in Settings).
    private DateTime Clock(DateTime realUtc, DateTime? simUtc)
    {
        var mode = J.Str(_store.Settings["clock"]);
        if (mode == "real" || simUtc is not { } sim) return realUtc;
        return mode == "sim" || Math.Abs((sim - realUtc).TotalSeconds) > 120 ? sim : realUtc;
    }

    private static JsonObject Obj(JsonObject parent, string key)
    {
        if (parent[key] is JsonObject o) return o;
        var created = new JsonObject();
        parent[key] = created;
        return created;
    }

    private static JsonArray Arr(JsonObject parent, string key)
    {
        if (parent[key] is JsonArray a) return a;
        var created = new JsonArray();
        parent[key] = created;
        return created;
    }

    private static void SetIfEmpty(JsonObject obj, string key, string value)
    {
        if (J.Str(obj[key]).Length == 0) obj[key] = value;
    }

    private static void SetIfEmpty(JsonObject obj, string key, double? value)
    {
        if (value is { } v && J.Num(obj[key]) is null) obj[key] = v;
    }

    // ---------------------------------------------------------------- airborne: fixes, go-arounds, fuel checks

    private bool Airborne(JsonObject f, JsonObject fuel, Sample s, DateTime now, double? fobKg)
    {
        var changed = false;

        if (_goAround.Update(s, now, airborne: true) is { } ga)
        {
            Arr(f, "goArounds").Add(new JsonObject { ["time"] = J.Iso(now), ["raFt"] = ga.RadioAltFt, ["reason"] = "", ["remark"] = "" });
            _store.Notify("Go-around detected", "The reason must be entered before the flight can be signed and closed.", "warn");
            changed = true;
        }

        changed |= PassFix(f, s, now, fobKg);

        // automatic fuel check every 30 or 60 minutes
        var settings = _store.Settings;
        if (J.Bool(settings["fuelCheckOn"], true) && fobKg is { } kg && J.Time(f["times"]?["off"]) is { } off)
        {
            var interval = J.Num(settings["fuelCheckMin"]) is { } m && m >= 5 ? m : 30;
            var last = J.Time(f["lastFuelCheck"]) ?? off;
            if ((now - last).TotalMinutes >= interval)
            {
                var plan = PlannedFob(f, fuel, off, now);
                Arr(f, "fuelChecks").Add(new JsonObject { ["time"] = J.Iso(now), ["fob"] = kg, ["plan"] = plan, ["auto"] = true });
                f["lastFuelCheck"] = J.Iso(now);
                var diff = plan is { } p ? kg - p : (double?)null;
                _store.Notify("Fuel check recorded", $"FOB {kg:N0} kg" + (diff is { } d ? $", {Math.Abs(d):N0} kg {(d >= 0 ? "above" : "below")} plan." : "."), diff < 0 ? "warn" : "info");
                changed = true;
            }
        }
        return changed;
    }

    // The next fix is passed when overhead, when the distance starts growing again, or when already beyond it.
    private bool PassFix(JsonObject f, Sample s, DateTime now, double? fobKg)
    {
        if (f["navlog"] is not JsonArray nav || nav.Count == 0) { _nextDistNm = null; return false; }

        var index = -1;
        for (var i = 0; i < nav.Count; i++)
        {
            if (nav[i] is not JsonObject x || J.Str(x["ata"]).Length > 0) continue;
            if (J.Num(x["lat"]) is null || J.Num(x["lon"]) is null) continue;
            index = i;
            break;
        }
        if (index < 0) { _nextDistNm = null; return false; }
        if (index != _fixIndex)
        {
            _fixIndex = index;
            _minDist = double.MaxValue;
        }

        var fix = (JsonObject)nav[index]!;
        double lat = J.Num(fix["lat"])!.Value, lon = J.Num(fix["lon"])!.Value;
        var d = Nm(s.Lat, s.Lon, lat, lon);
        _nextDistNm = d;
        _minDist = Math.Min(_minDist, d);

        // The arrival airport is "passed" at touchdown, not when flying overhead.
        if (J.Str(fix["type"]) == "apt" && index == nav.Count - 1) return false;

        var beyond = false;
        for (var j = index + 1; j < nav.Count; j++)
        {
            if (nav[j] is JsonObject after && J.Num(after["lat"]) is { } aLat && J.Num(after["lon"]) is { } aLon)
            {
                beyond = Nm(s.Lat, s.Lon, aLat, aLon) < Nm(lat, lon, aLat, aLon);
                break;
            }
        }
        if (!(d < 2 || (_minDist < 10 && d > _minDist + 0.5) || beyond)) return false;

        fix["ata"] = J.Iso(now);
        if (fobKg is { } kg) fix["fob"] = kg;
        fix["alt"] = Math.Round(s.AltFt);
        fix["auto"] = true;
        _minDist = double.MaxValue;

        var note = "";
        if (fobKg is { } actual && J.Num(fix["planFob"]) is { } plan)
        {
            var diff = actual - plan;
            note = $" FOB {actual:N0} kg, {Math.Abs(diff):N0} kg {(diff >= 0 ? "above" : "below")} plan.";
        }
        _store.Notify("Passed " + J.Str(fix["ident"]), $"{now:HH:mm}z." + note);
        return true;
    }

    private static double? PlannedFob(JsonObject f, JsonObject fuel, DateTime off, DateTime now)
    {
        var t = (now - off).TotalSeconds;
        var points = new List<(double T, double Fob)>();
        if (J.Num(fuel["planTakeoff"]) is { } start) points.Add((0, start));
        if (f["navlog"] is JsonArray nav)
            foreach (var n in nav)
                if (n is JsonObject x && J.Num(x["planT"]) is { } pt && J.Num(x["planFob"]) is { } pf) points.Add((pt, pf));
        if (points.Count < 2) return null;
        for (var i = 1; i < points.Count; i++)
        {
            if (t > points[i].T) continue;
            var (a, b) = (points[i - 1], points[i]);
            var k = b.T == a.T ? 0 : Math.Max(0, (t - a.T) / (b.T - a.T));
            return Math.Round(a.Fob + (b.Fob - a.Fob) * k);
        }
        return points[^1].Fob;
    }

    // ---------------------------------------------------------------- landing

    private void Landing(JsonObject f, JsonObject times, JsonObject fuel, Sample s, DateTime now, double? fobKg)
    {
        SetIfEmpty(times, "on", J.Iso(now));
        SetIfEmpty(fuel, "on", fobKg);

        var landing = new JsonObject
        {
            ["rate"] = _tracker.LandingRate,
            ["gsKt"] = _tracker.TouchdownGroundSpeedKt is { } gs ? Math.Round(gs) : null,
            ["lat"] = _tracker.TouchdownLat,
            ["lon"] = _tracker.TouchdownLon,
        };
        if (_tracker.TouchdownLat is { } la && _tracker.TouchdownLon is { } lo &&
            Db?.Find(la, lo, _tracker.ApproachTrackDeg ?? s.HeadingDeg) is { } m)
        {
            landing["runway"] = m.Runway;
            landing["airport"] = m.Airport;
            landing["distFt"] = Math.Round(m.DistanceFromThresholdFt);
            landing["offsetFt"] = Math.Round(m.OffsetFromCentrelineFt, 1);
            landing["lengthFt"] = Math.Round(m.LengthFt);
            landing["widthFt"] = Math.Round(m.WidthFt);
        }
        f["landing"] = landing;

        // the arrival airport at the end of the NavLog gets the landing time and fuel
        if (f["navlog"] is JsonArray nav && nav.Count > 0 && nav[^1] is JsonObject last &&
            J.Str(last["type"]) == "apt" && J.Str(last["ata"]).Length == 0)
        {
            last["ata"] = J.Iso(now);
            if (fobKg is { } kg) last["fob"] = kg;
            last["alt"] = Math.Round(s.AltFt);
            last["auto"] = true;
        }
        _nextDistNm = null;

        var where = J.Str(landing["runway"]).Length > 0 ? $" on runway {J.Str(landing["runway"])} {J.Str(landing["airport"])}" : "";
        _store.Notify("Landed", $"{_tracker.LandingRate} fpm{where}.", "good");
    }

    // ---------------------------------------------------------------- fuel uplift while parked

    private bool Refuelling(JsonObject f, JsonObject fuel, Sample s, DateTime now, double kg)
    {
        if (s.GroundSpeedKt > 1) { _fuelBase = _fuelLast = kg; return false; }
        if (double.IsNaN(_fuelBase)) { _fuelBase = _fuelLast = kg; _fuelStableSince = now; return false; }

        if (Math.Abs(kg - _fuelLast) > 5)
        {
            _fuelLast = kg;
            _fuelStableSince = now;
            if (kg < _fuelBase) _fuelBase = kg;      // defuelling or a new, lower starting point
            return false;
        }
        var uplift = kg - _fuelBase;
        if (uplift < 100 || (now - _fuelStableSince).TotalSeconds < 45) return false;

        _fuelBase = kg;
        fuel["uplift"] = (J.Num(fuel["uplift"]) ?? 0) + uplift;
        var settings = _store.Settings;
        var price = J.Num(settings["fuelPrice"]) ?? 0.95;
        var currency = J.Str(settings["currency"]) is { Length: > 0 } c ? c : "EUR";
        var density = J.Num(settings["fuelDensity"]) is { } dn && dn > 0.5 ? dn : 0.8;
        var gsx = Obj(f, "gsx");
        Arr(gsx, "receipts").Add(new JsonObject
        {
            ["id"] = Guid.NewGuid().ToString("N")[..10],
            ["time"] = J.Iso(now),
            ["type"] = "Fuel",
            ["text"] = $"{uplift:N0} kg Jet A-1 uplift ({uplift / density:N0} l)",
            ["amount"] = Math.Round(uplift * price, 2),
            ["currency"] = currency,
            ["auto"] = true,
        });
        _store.Notify("Fuel receipt saved", $"Uplift {uplift:N0} kg, {uplift * price:N2} {currency}.", "good");
        return true;
    }

    public static double Nm(double lat1, double lon1, double lat2, double lon2)
    {
        static double R(double x) => x * Math.PI / 180;
        var h = Math.Pow(Math.Sin(R(lat2 - lat1) / 2), 2) +
                Math.Cos(R(lat1)) * Math.Cos(R(lat2)) * Math.Pow(Math.Sin(R(lon2 - lon1) / 2), 2);
        return 2 * 3440.065 * Math.Asin(Math.Sqrt(h));
    }
}
