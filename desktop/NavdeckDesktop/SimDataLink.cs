namespace NavdeckLink;

// Prefer the simulator's direct SimConnect interface. FSUIPC7 remains a
// compatibility fallback for systems without a usable SimConnect runtime.
internal sealed class SimDataLink : IDisposable
{
    private readonly SimConnectLink _direct = new();
    private readonly FsuipcLink _fsuipc = new();
    private bool _usingDirect;

    public bool IsOpen => _usingDirect ? _direct.IsOpen : _fsuipc.IsOpen;
    public string? AircraftTitle =>
        _usingDirect ? _direct.AircraftTitle : _fsuipc.AircraftTitle;
    public string ConnectionName => _usingDirect ? "SimConnect" : "FSUIPC7";

    public bool TryOpen()
    {
        if (IsOpen) return true;
        if (_direct.TryOpen())
        {
            _usingDirect = true;
            return true;
        }
        if (_fsuipc.TryOpen())
        {
            _usingDirect = false;
            return true;
        }
        return false;
    }

    public Sample? Read() =>
        _usingDirect ? _direct.Read() : _fsuipc.Read();

    public void Dispose()
    {
        _direct.Dispose();
        _fsuipc.Dispose();
    }
}
