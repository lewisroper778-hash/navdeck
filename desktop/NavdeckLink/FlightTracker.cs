namespace NavdeckLink;

internal enum Stage { Parked, TaxiOut, Airborne, TaxiIn, Arrived }

internal readonly record struct Sample(bool OnGround, double GroundSpeedKt, double TouchdownFpm, bool ParkingBrake, int FuelLb);

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

    public TimeSpan? AirTime => Takeoff is { } t ? (Landing ?? DateTime.UtcNow) - t : null;
    public TimeSpan? BlockTime => GateOut is { } o ? (GateIn ?? DateTime.UtcNow) - o : null;

    public SimEvent? Update(Sample s, DateTime now)
    {
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
        _stillSince = null;
    }
}
