namespace NavdeckLink;

// Prefer the simulator's direct SimConnect interface. FSUIPC7 remains a
// compatibility fallback for systems without a usable SimConnect runtime.
internal sealed class SimDataLink : IDisposable
{
    private readonly SimConnectLink _direct = new();
    private readonly FsuipcLink _fsuipc = new();
    private bool _usingDirect;
    private DateTime _retryDirectAt = DateTime.MinValue;

    public bool IsOpen => _usingDirect ? _direct.IsOpen : _fsuipc.IsOpen;
    public string? AircraftTitle =>
        _usingDirect ? _direct.AircraftTitle : _fsuipc.AircraftTitle;
    public string ConnectionName => _usingDirect ? "SimConnect" : "FSUIPC7";

    public bool TryOpen()
    {
        if (IsOpen) return true;
        if (DateTime.UtcNow >= _retryDirectAt && _direct.TryOpen())
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

    public Sample? Read()
    {
        if (!_usingDirect) return _fsuipc.Read();
        var sample = _direct.Read();
        if (!_direct.IsOpen)
        {
            // A runtime that connects but cannot supply valid telemetry
            // should not trap the app in a repeated SimConnect loop.
            _retryDirectAt = DateTime.UtcNow.AddMinutes(2);
        }
        return sample;
    }

    public void Dispose()
    {
        _direct.Dispose();
        _fsuipc.Dispose();
    }
}
