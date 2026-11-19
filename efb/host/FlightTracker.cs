namespace NavdeckEfb;

internal enum Stage { Parked, TaxiOut, Airborne, TaxiIn, Arrived }

internal sealed record SimEvent(string Type);

// Turns sim samples into gate-out / take-off / landing / gate-in events, each fired once per flight.
internal sealed class FlightTracker
{
    private DateTime? _stillSince;
    private DateTime? _contactAt, _groundSince, _airSince;
    private int _contactRate;
    private double? _contactLat, _contactLon, _contactGs, _contactTrack;
    private double? _prevLat, _prevLon, _lastApproachTrack;
    private double _lastAirborneVs = double.NaN;

    public Stage Stage { get; private set; } = Stage.Parked;
    public int? LandingRate { get; private set; }
    public double? TouchdownLat { get; private set; }
    public double? TouchdownLon { get; private set; }
    public double? TouchdownGroundSpeedKt { get; private set; }
    public double? ApproachTrackDeg { get; private set; }
    public DateTime? TouchdownTime { get; private set; }

    // A wheel contact only becomes the landing once the aircraft stays on the ground and slows down.
    // Lifting off again before that is a bounce (kept as one landing) or a touch-and-go.
    private const double ConfirmBelowKt = 40;
    private static readonly TimeSpan ConfirmAfter = TimeSpan.FromSeconds(6);
    private const double ConfirmAfterBelowKt = 80;

    public SimEvent? Update(Sample s, DateTime now)
    {
        if (!s.OnGround && s.GroundSpeedKt > 40 && s.HasPosition)
        {
            if (_prevLat is { } la && _prevLon is { } lo)
            {
                var north = (s.Lat - la) * 111195;
                var east = (s.Lon - lo) * 111195 * Math.Cos(s.Lat * Math.PI / 180);
                if (Math.Sqrt(north * north + east * east) >= 5)
                    _lastApproachTrack = Bearing(la, lo, s.Lat, s.Lon);
            }
            _prevLat = s.Lat;
            _prevLon = s.Lon;
        }
        if (!s.OnGround && double.IsFinite(s.VerticalSpeedFpm))
            _lastAirborneVs = s.VerticalSpeedFpm;

        switch (Stage)
        {
            case Stage.Parked when s.OnGround && s.GroundSpeedKt > 3:
                Stage = Stage.TaxiOut;
                return new SimEvent("gateout");

            case Stage.TaxiOut when !s.OnGround && s.GroundSpeedKt > 40:
                Stage = Stage.Airborne;
                return new SimEvent("takeoff");

            case Stage.Airborne:
                return AirborneOrLanding(s, now);

            case Stage.TaxiIn when !s.OnGround && s.GroundSpeedKt > 40:
                // Airborne again after a landing was recorded (a long touch-and-go): the flight continues.
                _airSince ??= now;
                if (now - _airSince >= TimeSpan.FromSeconds(2))
                {
                    Stage = Stage.Airborne;
                    ClearTouchdown();
                    _airSince = null;
                    return new SimEvent("relaunch");
                }
                break;

            case Stage.TaxiIn:
                _airSince = null;
                // Parked = stopped with the brake set, or stopped with the engine shut down.
                if (s.OnGround && s.GroundSpeedKt < 1 && (s.ParkingBrake || !s.Engine1On))
                {
                    _stillSince ??= now;
                    var needed = s.Engine1On ? TimeSpan.FromSeconds(20) : TimeSpan.FromSeconds(8);
                    if (now - _stillSince >= needed)
                    {
                        Stage = Stage.Arrived;
                        return new SimEvent("gatein");
                    }
                }
                else
                {
                    _stillSince = null;
                }
                break;
        }
        return null;
    }

    private SimEvent? AirborneOrLanding(Sample s, DateTime now)
    {
        if (s.OnGround)
        {
            _groundSince ??= now;
            if (_contactAt is null)
            {
                // First wheel contact: keep its numbers, they are the landing if it is confirmed.
                var rate = Math.Abs(s.TouchdownFpm);
                if (rate < 1 && double.IsFinite(_lastAirborneVs)) rate = Math.Abs(_lastAirborneVs);
                _contactAt = now;
                _contactRate = (int)Math.Round(rate);
                _contactTrack = _lastApproachTrack;
                if (s.HasPosition)
                {
                    _contactLat = s.Lat;
                    _contactLon = s.Lon;
                    _contactGs = s.GroundSpeedKt;
                }
            }
            var settled = s.GroundSpeedKt < ConfirmBelowKt ||
                          (now - _groundSince >= ConfirmAfter && s.GroundSpeedKt < ConfirmAfterBelowKt);
            if (!settled) return null;

            Stage = Stage.TaxiIn;
            LandingRate = _contactRate;
            ApproachTrackDeg = _contactTrack;
            TouchdownLat = _contactLat;
            TouchdownLon = _contactLon;
            TouchdownGroundSpeedKt = _contactGs;
            TouchdownTime = _contactAt;
            _contactAt = _groundSince = null;
            return new SimEvent("landing");
        }

        _groundSince = null;
        if (_contactAt is null) return null;

        // Off the ground again. A bounce stays low and keeps the first contact as the touchdown;
        // climbing away means it was a touch-and-go and the flight carries on.
        var lowBounce = double.IsFinite(s.AglFt) && s.AglFt < 50 &&
                        (!double.IsFinite(s.VerticalSpeedFpm) || s.VerticalSpeedFpm < 600) &&
                        now - _contactAt < TimeSpan.FromSeconds(15);
        if (lowBounce) return null;
        _contactAt = null;
        return new SimEvent("touchandgo");
    }

    // Puts the tracker back into a stage after the app restarts in the middle of a flight.
    public void Resume(Stage stage)
    {
        Stage = stage;
        _contactAt = _groundSince = _airSince = null;
        _stillSince = null;
    }

    private void ClearTouchdown()
    {
        LandingRate = null;
        TouchdownLat = TouchdownLon = TouchdownGroundSpeedKt = ApproachTrackDeg = null;
        TouchdownTime = null;
        _contactAt = _groundSince = null;
    }

    public void Reset()
    {
        Stage = Stage.Parked;
        LandingRate = null;
        TouchdownLat = TouchdownLon = TouchdownGroundSpeedKt = ApproachTrackDeg = null;
        _prevLat = _prevLon = _lastApproachTrack = null;
        _lastAirborneVs = double.NaN;
        _stillSince = null;
        TouchdownTime = null;
        _contactAt = _groundSince = _airSince = null;
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
