namespace NavdeckLink;

internal enum Stage { Parked, TaxiOut, Airborne, TaxiIn, Arrived }

internal readonly record struct Sample(bool OnGround, double GroundSpeedKt, double TouchdownFpm, bool ParkingBrake, int FuelLb, double Lat = 0, double Lon = 0, double AltFt = 0);

internal sealed record SimEvent(string Type, int? LandingRate = null, int? FuelLb = null);

// Turns sim samples into gate-out / takeoff / landing / gate-in events, each fired once per flight
internal sealed class FlightTracker
{
    private DateTime? _stillSince;

    public Stage Stage { get; private set; } = Stage.Parked;
    public DateTime? GateOut { get; private set; }
    public DateTime? Takeoff { get; private set; }
    public DateTime? Landing { get; private set; }
    public DateTime? GateIn { get; private set; }
    public int? LandingRate { get; private set; }
    public double? TouchdownLat { get; private set; }
    public double? TouchdownLon { get; private set; }
    public double? TouchdownGroundSpeedKt { get; private set; }
    public double? ApproachTrackDeg { get; private set; }

    private double? _previousLat;
    private double? _previousLon;
    private double? _lastApproachTrack;

    private static double Bearing(
        double lat1, double lon1,
        double lat2, double lon2)
    {
        double a = lat1 * Math.PI / 180;
        double b = lat2 * Math.PI / 180;
        double d = (lon2 - lon1) * Math.PI / 180;

        double y = Math.Sin(d) * Math.Cos(b);
        double x = Math.Cos(a) * Math.Sin(b) -
                   Math.Sin(a) * Math.Cos(b) * Math.Cos(d);

        return (Math.Atan2(y, x) * 180 / Math.PI + 360) % 360;
    }



    public TimeSpan? AirTime => Takeoff is { } t ? (Landing ?? DateTime.UtcNow) - t : null;
    public TimeSpan? BlockTime => GateOut is { } o ? (GateIn ?? DateTime.UtcNow) - o : null;

    public SimEvent? Update(Sample s, DateTime now)
    {
        if (!s.OnGround &&
            s.GroundSpeedKt > 40 &&
            double.IsFinite(s.Lat) &&
            double.IsFinite(s.Lon) &&
            s.Lat >= -90 && s.Lat <= 90 &&
            s.Lon >= -180 && s.Lon <= 180 &&
            !(s.Lat == 0 && s.Lon == 0))
        {
            if (_previousLat is { } lat &&
                _previousLon is { } lon)
            {
                double north = (s.Lat - lat) * 111195;
                double east = (s.Lon - lon) * 111195 *
                    Math.Cos(s.Lat * Math.PI / 180);

                if (Math.Sqrt(north * north + east * east) >= 5)
                    _lastApproachTrack =
                        Bearing(lat, lon, s.Lat, s.Lon);
            }

            _previousLat = s.Lat;
            _previousLon = s.Lon;
        }

        switch (Stage)
        {
            case Stage.Parked when s.OnGround && s.GroundSpeedKt > 3:
                Stage = Stage.TaxiOut;
                GateOut = now;
                return new SimEvent("off");
            case Stage.TaxiOut when !s.OnGround && s.GroundSpeedKt > 40:
                Stage = Stage.Airborne;
                Takeoff = now;
                return new SimEvent("takeoff");
            case Stage.Airborne when s.OnGround:
                Stage = Stage.TaxiIn;
                Landing = now;
                LandingRate = (int)Math.Round(Math.Abs(s.TouchdownFpm));
                ApproachTrackDeg = _lastApproachTrack;

                if (double.IsFinite(s.Lat) &&
                    double.IsFinite(s.Lon) &&
                    s.Lat >= -90 && s.Lat <= 90 &&
                    s.Lon >= -180 && s.Lon <= 180 &&
                    !(s.Lat == 0 && s.Lon == 0))
                {
                    TouchdownLat = s.Lat;
                    TouchdownLon = s.Lon;
                    TouchdownGroundSpeedKt = s.GroundSpeedKt;
                }

                return new SimEvent("landing", LandingRate);
            case Stage.TaxiIn:
                if (s.OnGround && s.GroundSpeedKt < 1 && s.ParkingBrake)
                {
                    _stillSince ??= now;
                    if (now - _stillSince > TimeSpan.FromSeconds(5))
                    {
                        Stage = Stage.Arrived;
                        GateIn = now;
                        return new SimEvent("on", FuelLb: s.FuelLb > 0 ? s.FuelLb : null);
                    }
                }
                else _stillSince = null;
                break;
        }
        return null;
    }

    public void Reset()
    {
        Stage = Stage.Parked;
        GateOut = Takeoff = Landing = GateIn = null;
        LandingRate = null;
        TouchdownLat = null;
        TouchdownLon = null;
        TouchdownGroundSpeedKt = null;
        ApproachTrackDeg = null;
        _previousLat = null;
        _previousLon = null;
        _lastApproachTrack = null;
        _stillSince = null;
    }
}
