using FSUIPC;

namespace NavdeckLink;

// Reads the aircraft state from FSUIPC7 (the unregistered free version is enough)
internal sealed class FsuipcLink : IDisposable
{
    private const double MpsToFpm = 196.850394;
    private const double MpsToKt = 1.94384449;

    private readonly Offset<short> _onGround = new("navdeck", 0x0366);
    private readonly Offset<int> _groundSpeed = new("navdeck", 0x02B4);   // m/s * 65536
    private readonly Offset<int> _vsTouchdown = new("navdeck", 0x030C);   // m/s * 256, latched at touchdown
    private readonly Offset<short> _parkingBrake = new("navdeck", 0x0BC8); // 0 off, 32767 on
    private readonly Offset<int> _fuelLb = new("navdeck", 0x126C);        // total fuel weight, pounds
    private readonly Offset<string> _title = new("navdeck", 0x3D00, 256);

    public bool IsOpen => FSUIPCConnection.IsOpen;
    public string? AircraftTitle { get; private set; }

    public bool TryOpen()
    {
        if (FSUIPCConnection.IsOpen) return true;
        try
        {
            FSUIPCConnection.Open();
            return true;
        }
        catch (FSUIPCException)
        {
            return false;
        }
    }

    public Sample? Read()
    {
        try
        {
            FSUIPCConnection.Process("navdeck");
            AircraftTitle = _title.Value?.Trim('\0', ' ');
            return new Sample(
                OnGround: _onGround.Value != 0,
                GroundSpeedKt: _groundSpeed.Value / 65536.0 * MpsToKt,
                TouchdownFpm: _vsTouchdown.Value / 256.0 * MpsToFpm,
                ParkingBrake: _parkingBrake.Value > 16000,
                FuelLb: _fuelLb.Value);
        }
        catch (FSUIPCException)
        {
            FSUIPCConnection.Close();
            return null;
        }
    }

    public void Dispose()
    {
        if (FSUIPCConnection.IsOpen) FSUIPCConnection.Close();
    }
}
