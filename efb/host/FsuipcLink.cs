using FSUIPC;

namespace NavdeckEfb;

// One snapshot of the aircraft. Only used on the UI thread after being read on the sim thread.
internal readonly record struct Sample(
    bool OnGround,
    double GroundSpeedKt,
    double TouchdownFpm,
    bool ParkingBrake,
    int FuelLb,
    double Lat = 0,
    double Lon = 0,
    double AltFt = 0,
    double HeadingDeg = 0,
    double RadioAltFt = double.NaN,
    double VerticalSpeedFpm = double.NaN,
    bool Engine1On = true,
    double GroundElevFt = double.NaN,
    bool? GearDown = null)
{
    // Height above the ground: the radio altimeter, or altitude minus ground elevation when the
    // aircraft's radio altimeter reads nothing (some MSFS aircraft, or above its range).
    public double AglFt =>
        double.IsFinite(RadioAltFt) && RadioAltFt > 1 ? RadioAltFt :
        double.IsFinite(GroundElevFt) ? Math.Max(0, AltFt - GroundElevFt) : RadioAltFt;

    public bool HasPosition =>
        double.IsFinite(Lat) && double.IsFinite(Lon) &&
        Lat is >= -90 and <= 90 && Lon is >= -180 and <= 180 &&
        !(Lat == 0 && Lon == 0);
}

// Reads the aircraft state from FSUIPC7 (the free, unregistered version is enough).
// Everything here must be called from a single background thread.
internal sealed class FsuipcLink : IDisposable
{
    private const double MpsToFpm = 196.850394;
    private const double MpsToKt = 1.94384449;
    private const string Group = "navdeck";

    private readonly Offset<short> _onGround = new(Group, 0x0366);
    private readonly Offset<int> _groundSpeed = new(Group, 0x02B4);      // m/s * 65536
    private readonly Offset<int> _vsTouchdown = new(Group, 0x030C);      // m/s * 256, latched at touchdown
    private readonly Offset<short> _parkingBrake = new(Group, 0x0BC8);   // 0 off, 32767 on
    private readonly Offset<int> _fuelLb = new(Group, 0x126C);           // total fuel weight, pounds
    private readonly Offset<string> _title = new(Group, 0x3D00, 256);
    private readonly Offset<long> _lat = new(Group, 0x0560);
    private readonly Offset<long> _lon = new(Group, 0x0568);
    private readonly Offset<uint> _heading = new(Group, 0x0580);         // true heading
    private readonly Offset<long> _alt = new(Group, 0x0570);             // metres * 65536 * 65536
    private readonly Offset<int> _radioAlt = new(Group, 0x31E4);         // metres * 65536
    private readonly Offset<int> _verticalSpeed = new(Group, 0x02C8);    // m/s * 256
    private readonly Offset<int> _groundElev = new(Group, 0x0020);       // metres * 256
    private readonly Offset<int> _gearHandle = new(Group, 0x0BE8);       // 0 up, 16383 down
    private readonly Offset<short> _engine1 = new(Group, 0x0894);        // combustion flag
    private readonly Offset<byte> _second = new(Group, 0x023A);          // simulator clock
    private readonly Offset<byte> _zuluHour = new(Group, 0x023B);
    private readonly Offset<byte> _zuluMinute = new(Group, 0x023C);
    private readonly Offset<short> _dayOfYear = new(Group, 0x023E);
    private readonly Offset<short> _year = new(Group, 0x0240);

    public bool IsOpen => FSUIPCConnection.IsOpen;
    public string AircraftTitle { get; private set; } = "";
    public DateTime? SimUtc { get; private set; }

    private DateTime? ReadSimClock()
    {
        int year = _year.Value, day = _dayOfYear.Value, hour = _zuluHour.Value, minute = _zuluMinute.Value, second = _second.Value;
        if (year < 1950 || year > 2200 || day < 1 || day > 366 || hour > 23 || minute > 59 || second > 59) return null;
        return new DateTime(year, 1, 1, hour, minute, second, DateTimeKind.Utc).AddDays(day - 1);
    }

    public bool TryOpen()
    {
        if (FSUIPCConnection.IsOpen) return true;
        try
        {
            FSUIPCConnection.Open();
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    public Sample? Read()
    {
        try
        {
            FSUIPCConnection.Process(Group);
            AircraftTitle = (_title.Value ?? "").Trim('\0', ' ');
            SimUtc = ReadSimClock();
            return new Sample(
                OnGround: _onGround.Value != 0,
                GroundSpeedKt: _groundSpeed.Value / 65536.0 * MpsToKt,
                TouchdownFpm: _vsTouchdown.Value / 256.0 * MpsToFpm,
                ParkingBrake: _parkingBrake.Value > 16000,
                FuelLb: _fuelLb.Value,
                Lat: _lat.Value * 90.0 / (10001750.0 * 65536.0 * 65536.0),
                Lon: _lon.Value * 360.0 / (65536.0 * 65536.0 * 65536.0 * 65536.0),
                AltFt: _alt.Value / (65536.0 * 65536.0) * 3.28084,
                HeadingDeg: _heading.Value * 360.0 / 4294967296.0,
                RadioAltFt: _radioAlt.Value / 65536.0 * 3.28084,
                VerticalSpeedFpm: _verticalSpeed.Value / 256.0 * MpsToFpm,
                Engine1On: _engine1.Value != 0,
                GroundElevFt: _groundElev.Value / 256.0 * 3.28084,
                GearDown: _gearHandle.Value > 8000);
        }
        catch (Exception)
        {
            Close();
            return null;
        }
    }

    public void Close()
    {
        try
        {
            if (FSUIPCConnection.IsOpen) FSUIPCConnection.Close();
        }
        catch (Exception)
        {
            // Nothing useful to do; the next TryOpen starts clean.
        }
    }

    public void Dispose() => Close();
}
