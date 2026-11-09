namespace NavdeckLink;

internal sealed record RouteFix(int Index, string Ident, double Lat, double Lon);

// Works out when the aircraft passes each navlog fix: overhead, closest approach (abeam) or already beyond it
internal sealed class WaypointWatcher
{
    private List<RouteFix> _route = [];
    private readonly HashSet<int> _sent = [];
    private double _minDist = double.MaxValue;

    public RouteFix? Next => _route.FirstOrDefault(f => !_sent.Contains(f.Index));
    public double? DistanceToNext { get; private set; }

    public void SetRoute(IEnumerable<RouteFix> pending)
    {
        var list = pending.Where(f => !_sent.Contains(f.Index)).ToList();
        if (Next?.Index != list.FirstOrDefault()?.Index) _minDist = double.MaxValue;
        _route = list;
    }

    public void Reset()
    {
        _route = [];
        _sent.Clear();
        _minDist = double.MaxValue;
        DistanceToNext = null;
    }

    public RouteFix? Update(double lat, double lon)
    {
        if (Next is not { } fix) return null;
        var d = Nm(lat, lon, fix.Lat, fix.Lon);
        DistanceToNext = d;
        _minDist = Math.Min(_minDist, d);
        var after = _route.SkipWhile(f => f.Index != fix.Index).Skip(1).FirstOrDefault();
        var beyond = after is not null && Nm(lat, lon, after.Lat, after.Lon) < Nm(fix.Lat, fix.Lon, after.Lat, after.Lon);
        if (d < 2 || (_minDist < 10 && d > _minDist + 0.5) || beyond)
        {
            _sent.Add(fix.Index);
            _minDist = double.MaxValue;
            return fix;
        }
        return null;
    }

    public static double Nm(double lat1, double lon1, double lat2, double lon2)
    {
        double r(double x) => x * Math.PI / 180;
        var h = Math.Pow(Math.Sin(r(lat2 - lat1) / 2), 2) + Math.Cos(r(lat1)) * Math.Cos(r(lat2)) * Math.Pow(Math.Sin(r(lon2 - lon1) / 2), 2);
        return 2 * 3440.065 * Math.Asin(Math.Sqrt(h));
    }
}
