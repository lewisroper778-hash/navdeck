namespace NavdeckLogbook;

internal enum Stage { Parked, TaxiOut, Airborne, TaxiIn, Arrived }

internal sealed record SimEvent(string Type);

// Turns sim samples into gate-out / take-off / landing / gate-in events, each fired once per flight.
internal sealed class FlightTracker
{
    private DateTime? _stillSince;
    private double? _prevLat, _prevLon, _lastApproachTrack;
    private double _lastAirborneVs = double.NaN;

    public Stage Stage { get; private set; } = Stage.Parked;
    public int? LandingRate { get; private set; }
    public double? TouchdownLat { get; private set; }
    public double? TouchdownLon { get; private set; }
    public double? TouchdownGroundSpeedKt { get; private set; }
    public double? ApproachTrackDeg { get; private set; }

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

            case Stage.Airborne when s.OnGround:
                Stage = Stage.TaxiIn;
                var rate = Math.Abs(s.TouchdownFpm);
                // The latched value is occasionally zero; fall back to the last vertical speed in the air.
                if (rate < 1 && double.IsFinite(_lastAirborneVs)) rate = Math.Abs(_lastAirborneVs);
                LandingRate = (int)Math.Round(rate);
                ApproachTrackDeg = _lastApproachTrack;
                if (s.HasPosition)
                {
                    TouchdownLat = s.Lat;
                    TouchdownLon = s.Lon;
                    TouchdownGroundSpeedKt = s.GroundSpeedKt;
                }
                return new SimEvent("landing");

            case Stage.TaxiIn:
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

    public void Reset()
    {
        Stage = Stage.Parked;
        LandingRate = null;
        TouchdownLat = TouchdownLon = TouchdownGroundSpeedKt = ApproachTrackDeg = null;
        _prevLat = _prevLon = _lastApproachTrack = null;
        _lastAirborneVs = double.NaN;
        _stillSince = null;
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
