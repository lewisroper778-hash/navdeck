using System.Runtime.InteropServices;

namespace NavdeckLink;

// Direct native SimConnect transport. Uses the Microsoft SimConnect runtime
// when SimConnect.dll is available on the PC; no FSUIPC process is involved.
// If the runtime isn't installed, SimDataLink transparently falls back to
// the existing FSUIPC7 adapter. Actual MSFS integration needs live testing.
internal sealed class SimConnectLink : IDisposable
{
    private const uint Definition = 1;
    private const uint Request = 1;
    private const uint DataTypeFloat64 = 4;
    private const uint DataTypeString256 = 9;
    private const uint UserAircraft = 0;
    private const uint PeriodSecond = 4;
    private const uint ReceiveObjectData = 8;
    private const uint ReceiveQuit = 3;
    private const uint ReceiveException = 1;
    private IntPtr _handle;
    private readonly DispatchProc _dispatch;
    private Sample? _latest;
    private DateTime _lastReceivedUtc;
    private DateTime _openedUtc;
    private bool _quit;
    public string? AircraftTitle { get; private set; }
    public bool IsOpen => _handle != IntPtr.Zero;

    public SimConnectLink() { _dispatch = Receive; }

    public bool TryOpen()
    {
        if (IsOpen) return true;
        try
        {
            int result = SimConnect_Open(out var connection, "NAVDECK Desktop",
                IntPtr.Zero, 0, IntPtr.Zero, 0);
            if (result < 0 || connection == IntPtr.Zero) return false;
            _handle = connection;
            _openedUtc = DateTime.UtcNow;
            _quit = false;
            _latest = null;
            Add("SIM ON GROUND", "Bool");
            Add("GROUND VELOCITY", "knots");
            Add("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second");
            Add("BRAKE PARKING POSITION", "Bool");
            Add("FUEL TOTAL QUANTITY WEIGHT", "pounds");
            Add("PLANE LATITUDE", "degrees");
            Add("PLANE LONGITUDE", "degrees");
            Add("PLANE ALTITUDE", "feet");
            Add("PLANE HEADING DEGREES TRUE", "degrees");
            Add("RADIO HEIGHT", "feet");
            Add("VERTICAL SPEED", "feet per minute");
            Add("TITLE", "", DataTypeString256);
            if (SimConnect_RequestDataOnSimObject(_handle, Request, Definition,
                    UserAircraft, PeriodSecond, 0, 0, 0, 0) < 0)
                throw new InvalidOperationException("SimConnect data request failed");
            return true;
        }
        catch (Exception ex) when (ex is DllNotFoundException or
            EntryPointNotFoundException or BadImageFormatException or
            InvalidOperationException or SEHException)
        {
            Close();
            return false;
        }
    }

    private void Add(string name, string units, uint type = DataTypeFloat64)
    {
        if (SimConnect_AddToDataDefinition(_handle, Definition,
                name, units, type, 0, 0) < 0)
            throw new InvalidOperationException("Unsupported SimConnect variable: " + name);
    }

    public Sample? Read()
    {
        if (!IsOpen) return null;
        try
        {
            if (SimConnect_CallDispatch(_handle, _dispatch, IntPtr.Zero) < 0 || _quit)
            {
                Close();
                return null;
            }
            if (DateTime.UtcNow - (_lastReceivedUtc == default
                    ? _openedUtc : _lastReceivedUtc) > TimeSpan.FromSeconds(12))
            {
                Close();
                return null;
            }
            return _latest;
        }
        catch (Exception ex) when (ex is SEHException or
            InvalidOperationException or AccessViolationException)
        {
            Close();
            return null;
        }
    }

    private void Receive(IntPtr message, uint length, IntPtr context)
    {
        if (length < 12) return;
        var id = (uint)Marshal.ReadInt32(message, 8);
        if (id == ReceiveQuit || id == ReceiveException)
        {
            _quit = true;
            return;
        }
        // SIMCONNECT_RECV header = 12 bytes, SIMOBJECT_DATA fields = 28
        // bytes. dwData begins at offset 40, with tightly packed SimVars.
        if (id != ReceiveObjectData || length < 40 + Marshal.SizeOf<SimVars>())
            return;
        var requestId = (uint)Marshal.ReadInt32(message, 12);
        if (requestId != Request) return;
        var raw = Marshal.PtrToStructure<SimVars>(IntPtr.Add(message, 40));
        if (!double.IsFinite(raw.Lat) || !double.IsFinite(raw.Lon) ||
            Math.Abs(raw.Lat) > 90 || Math.Abs(raw.Lon) > 180 ||
            !double.IsFinite(raw.GroundSpeedKt) || raw.GroundSpeedKt < 0 ||
            raw.GroundSpeedKt > 1500) return;
        AircraftTitle = raw.Title?.Trim('\0', ' ');
        _latest = new Sample(
            OnGround: raw.OnGround > 0.5,
            GroundSpeedKt: raw.GroundSpeedKt,
            TouchdownFpm: Math.Abs(raw.TouchdownFps * 60),
            ParkingBrake: raw.ParkingBrake > 0.5,
            FuelLb: double.IsFinite(raw.FuelLb)
                ? (int)Math.Clamp(Math.Round(raw.FuelLb), 0, 2000000) : 0,
            Lat: raw.Lat,
            Lon: raw.Lon,
            AltFt: raw.AltFt,
            HeadingDeg: raw.HeadingDeg,
            RadioAltFt: raw.RadioHeightFt,
            VerticalSpeedFpm: raw.VerticalSpeedFpm);
        _lastReceivedUtc = DateTime.UtcNow;
    }

    public void Close()
    {
        var old = _handle;
        _handle = IntPtr.Zero;
        _latest = null;
        _lastReceivedUtc = default;
        _openedUtc = default;
        AircraftTitle = null;
        if (old != IntPtr.Zero)
        {
            try { SimConnect_Close(old); }
            catch (Exception ex) when (ex is DllNotFoundException or SEHException) { }
        }
    }

    public void Dispose() => Close();

    [StructLayout(LayoutKind.Sequential, Pack = 1, CharSet = CharSet.Ansi)]
    private struct SimVars
    {
        public double OnGround;
        public double GroundSpeedKt;
        public double TouchdownFps;
        public double ParkingBrake;
        public double FuelLb;
        public double Lat;
        public double Lon;
        public double AltFt;
        public double HeadingDeg;
        public double RadioHeightFt;
        public double VerticalSpeedFpm;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string Title;
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate void DispatchProc(IntPtr data, uint cbData, IntPtr context);

    [DllImport("SimConnect.dll", CallingConvention = CallingConvention.StdCall,
        CharSet = CharSet.Ansi, ExactSpelling = true)]
    private static extern int SimConnect_Open(out IntPtr connection,
        [MarshalAs(UnmanagedType.LPStr)] string name, IntPtr hwnd,
        uint eventId, IntPtr eventHandle, uint configIndex);

    [DllImport("SimConnect.dll", CallingConvention = CallingConvention.StdCall,
        CharSet = CharSet.Ansi, ExactSpelling = true)]
    private static extern int SimConnect_AddToDataDefinition(IntPtr connection,
        uint definition, [MarshalAs(UnmanagedType.LPStr)] string datum,
        [MarshalAs(UnmanagedType.LPStr)] string units, uint type,
        float epsilon, uint datumId);

    [DllImport("SimConnect.dll", CallingConvention = CallingConvention.StdCall,
        ExactSpelling = true)]
    private static extern int SimConnect_RequestDataOnSimObject(IntPtr connection,
        uint request, uint definition, uint objectId, uint period,
        uint flags, uint origin, uint interval, uint limit);

    [DllImport("SimConnect.dll", CallingConvention = CallingConvention.StdCall,
        ExactSpelling = true)]
    private static extern int SimConnect_CallDispatch(IntPtr connection,
        DispatchProc callback, IntPtr context);

    [DllImport("SimConnect.dll", CallingConvention = CallingConvention.StdCall,
        ExactSpelling = true)]
    private static extern int SimConnect_Close(IntPtr connection);
}
