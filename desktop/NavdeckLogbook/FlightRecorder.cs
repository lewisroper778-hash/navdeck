namespace NavdeckLogbook;

// Turns the stream of sim samples into a finished FlightRecord, fully automatically:
// gate out, take-off, route fixes (or timed checkpoints), landing rate, touchdown point, gate in.
// Not thread-safe: call it from the UI thread only.
internal sealed class FlightRecorder
{
    private const int TrackEverySeconds = 10;
    private const int CheckpointEveryMinutes = 15;
    private const int MaxTrackPoints = 4000;

    private readonly FlightTracker _tracker = new();
    private readonly GoAroundDetector _goAround = new();
    private readonly WaypointWatcher _watcher = new();
    private readonly Task<RunwayDb> _db;

    private DateTime _lastTrackUtc = DateTime.MinValue;
    private DateTime _lastCheckpointUtc = DateTime.MinValue;
    private bool _hasRoute;
    private string _plannedOrigin = "", _plannedDestination = "";

    public FlightRecorder(Task<RunwayDb> runwayDb) => _db = runwayDb;

    public FlightRecord Current { get; private set; } = new();
    public FlightRecord? LastCompleted { get; private set; }
    public Stage Stage => _tracker.Stage;
    public RouteFix? NextFix => _watcher.Next;
    public double? DistanceToNextNm => _watcher.DistanceToNext;
    public bool HasRoute => _hasRoute;

    // What the screen should show: the flight in progress, or the one that just finished.
    public FlightRecord Shown => Stage == Stage.Parked && LastCompleted is not null ? LastCompleted : Current;

    public event Action<string>? Message;
    public event Action<FlightRecord>? FlightCompleted;
    public event Action? Changed;

    private RunwayDb? Db => _db.IsCompletedSuccessfully ? _db.Result : null;

    public void ApplyFlightPlan(OfpInfo ofp)
    {
        _watcher.SetRoute(ofp.Route);
        _hasRoute = ofp.Route.Count > 0;
        _plannedOrigin = ofp.Origin;
        _plannedDestination = ofp.Destination;

        if (Stage == Stage.Parked)
        {
            if (string.IsNullOrWhiteSpace(Current.Callsign)) Current.Callsign = ofp.Callsign;
            if (string.IsNullOrWhiteSpace(Current.Origin)) Current.Origin = ofp.Origin;
            if (string.IsNullOrWhiteSpace(Current.Destination)) Current.Destination = ofp.Destination;
        }
        Message?.Invoke($"SimBrief plan loaded: {ofp.Origin} to {ofp.Destination}, {ofp.Route.Count} fixes.");
        Changed?.Invoke();
    }

    public void Feed(Sample s, DateTime nowUtc, string aircraftTitle)
    {
        if (Stage == Stage.Parked && !string.IsNullOrWhiteSpace(aircraftTitle))
            Current.Aircraft = aircraftTitle;

        // Before the flight starts, work out where we are parked.
        if (Stage == Stage.Parked && string.IsNullOrWhiteSpace(Current.Origin) && s.HasPosition && Db is { } db0)
            Current.Origin = db0.NearestAirport(s.Lat, s.Lon) ?? "";

        var ev = _tracker.Update(s, nowUtc);
        var changed = false;

        switch (ev?.Type)
        {
            case "gateout":
                LastCompleted = null;
                if (Current.GateOutUtc is not null) Current = NewRecord(Current);
                Current.GateOutUtc = nowUtc;
                Current.FuelGateOutLb = Fuel(s);
                if (!string.IsNullOrWhiteSpace(aircraftTitle)) Current.Aircraft = aircraftTitle;
                if (string.IsNullOrWhiteSpace(Current.Origin) && s.HasPosition && Db is { } db1)
                    Current.Origin = db1.NearestAirport(s.Lat, s.Lon) ?? "";
                Message?.Invoke($"Gate out {Fmt.ShortTime(nowUtc)}  {Fmt.Fuel(Current.FuelGateOutLb, false)}");
                changed = true;
                break;

            case "takeoff":
                Current.TakeoffUtc = nowUtc;
                Current.FuelTakeoffLb = Fuel(s);
                _lastTrackUtc = DateTime.MinValue;
                _lastCheckpointUtc = nowUtc;
                Message?.Invoke($"Take-off {Fmt.ShortTime(nowUtc)}  {Fmt.Fuel(Current.FuelTakeoffLb, false)}");
                changed = true;
                break;

            case "landing":
                CompleteLanding(s, nowUtc);
                changed = true;
                break;

            case "gatein":
                CompleteFlight(s, nowUtc);
                return;
        }

        if (Stage == Stage.Airborne)
            changed |= RecordAirborne(s, nowUtc);

        if (changed) Changed?.Invoke();
    }

    private bool RecordAirborne(Sample s, DateTime nowUtc)
    {
        var changed = false;
        if (!s.HasPosition) return false;

        var alt = (int)Math.Round(s.AltFt);
        if (alt > Current.MaxAltitudeFt) Current.MaxAltitudeFt = alt;

        if (_goAround.Update(s, nowUtc, airborne: true) is { } ga)
        {
            Current.GoArounds++;
            Message?.Invoke($"Go-around detected at {ga.RadioAltFt:N0} ft AGL");
            changed = true;
        }

        if ((nowUtc - _lastTrackUtc).TotalSeconds >= TrackEverySeconds && Current.Track.Count < MaxTrackPoints)
        {
            _lastTrackUtc = nowUtc;
            var since = Current.TakeoffUtc is { } t ? (int)(nowUtc - t).TotalSeconds : 0;
            Current.Track.Add(new TrackPoint { Lat = s.Lat, Lon = s.Lon, AltFt = alt, Seconds = since });
        }

        if (_hasRoute)
        {
            if (_watcher.Update(s.Lat, s.Lon) is { } fix)
            {
                AddWaypoint(fix.Ident, s, nowUtc, isRoute: true);
                changed = true;
            }
        }
        else if ((nowUtc - _lastCheckpointUtc).TotalMinutes >= CheckpointEveryMinutes)
        {
            _lastCheckpointUtc = nowUtc;
            var elapsed = Current.TakeoffUtc is { } t ? nowUtc - t : TimeSpan.Zero;
            AddWaypoint($"+{(int)elapsed.TotalHours}:{elapsed.Minutes:00}", s, nowUtc, isRoute: false);
            changed = true;
        }
        return changed;
    }

    private void AddWaypoint(string ident, Sample s, DateTime nowUtc, bool isRoute)
    {
        Current.Waypoints.Add(new WaypointLog
        {
            Ident = ident,
            TimeUtc = nowUtc,
            FuelLb = Fuel(s),
            AltFt = (int)Math.Round(s.AltFt),
            Lat = s.Lat,
            Lon = s.Lon,
            IsRouteFix = isRoute,
        });
        Message?.Invoke($"{Fmt.ShortTime(nowUtc)} passed {ident}  {s.AltFt:N0} ft  {Fmt.Fuel(Fuel(s), false)}");
    }

    private void CompleteLanding(Sample s, DateTime nowUtc)
    {
        Current.LandingUtc = nowUtc;
        Current.FuelLandingLb = Fuel(s);
        Current.LandingRateFpm = _tracker.LandingRate;
        Current.TouchdownGroundSpeedKt = _tracker.TouchdownGroundSpeedKt is { } gs ? (int)Math.Round(gs) : null;
        Current.TouchdownLat = _tracker.TouchdownLat;
        Current.TouchdownLon = _tracker.TouchdownLon;

        // Close the track at the touchdown point.
        if (_tracker.TouchdownLat is { } la && _tracker.TouchdownLon is { } lo && Current.Track.Count < MaxTrackPoints + 1)
        {
            var since = Current.TakeoffUtc is { } t ? (int)(nowUtc - t).TotalSeconds : 0;
            Current.Track.Add(new TrackPoint { Lat = la, Lon = lo, AltFt = (int)Math.Round(s.AltFt), Seconds = since });
        }

        MatchRunway(s);
        Message?.Invoke(
            $"Landed {Fmt.ShortTime(nowUtc)}  {Fmt.RateText(Current.LandingRateFpm)}" +
            (Current.LandingRunway.Length > 0
                ? $"  {Current.LandingAirport} runway {Current.LandingRunway}, {Fmt.Feet(Current.TouchdownDistanceFt)} past threshold"
                : "  runway not identified"));
    }

    // Retried at gate-in too, in case the runway database was still loading at touchdown.
    private void MatchRunway(Sample s)
    {
        if (Current.LandingRunway.Length > 0 || Db is not { } db) return;
        if (Current.TouchdownLat is not { } la || Current.TouchdownLon is not { } lo) return;

        var track = _tracker.ApproachTrackDeg ?? s.HeadingDeg;
        if (db.Find(la, lo, track) is { } m)
        {
            Current.LandingAirport = m.Airport;
            Current.LandingRunway = m.Runway;
            Current.TouchdownDistanceFt = Math.Round(m.DistanceFromThresholdFt);
            Current.TouchdownOffsetFt = Math.Round(m.OffsetFromCentrelineFt, 1);
            Current.RunwayLengthFt = Math.Round(m.LengthFt);
            Current.RunwayWidthFt = Math.Round(m.WidthFt);
        }
    }

    private void CompleteFlight(Sample s, DateTime nowUtc)
    {
        Current.GateInUtc = nowUtc;
        Current.FuelGateInLb = Fuel(s);
        MatchRunway(s);

        var arrival = Current.LandingAirport;
        if (arrival.Length == 0 && s.HasPosition && Db is { } db)
            arrival = db.NearestAirport(s.Lat, s.Lon) ?? "";
        if (arrival.Length > 0) Current.Destination = arrival;
        else if (string.IsNullOrWhiteSpace(Current.Destination)) Current.Destination = _plannedDestination;

        if (string.IsNullOrWhiteSpace(Current.Origin)) Current.Origin = _plannedOrigin;

        var done = Current;
        LastCompleted = done;
        Message?.Invoke($"Gate in {Fmt.ShortTime(nowUtc)}  {Fmt.Fuel(done.FuelGateInLb, false)}  block {Fmt.Duration(done.BlockTime)}");

        // Ready for the next flight: it starts when the aircraft next moves.
        Current = NewRecord(done);
        _tracker.Reset();
        _goAround.Reset();
        _watcher.Reset();
        _hasRoute = false;
        _plannedOrigin = _plannedDestination = "";

        FlightCompleted?.Invoke(done);
        Changed?.Invoke();
    }

    // The next leg starts where the last one ended.
    private static FlightRecord NewRecord(FlightRecord previous) => new()
    {
        Aircraft = previous.Aircraft,
        Callsign = previous.Callsign,
        Origin = previous.Destination,
    };

    private static int? Fuel(Sample s) => s.FuelLb is > 0 and <= 2_000_000 ? s.FuelLb : null;
}
