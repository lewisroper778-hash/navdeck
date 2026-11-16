using System.Globalization;
using System.Reflection;

namespace NavdeckLogbook;

internal sealed record RunwayMatch(
    string Airport,
    string Runway,
    double DistanceFromThresholdFt,
    double OffsetFromCentrelineFt,   // + right of the landing direction
    double LengthFt,
    double WidthFt,
    double Score);

// Compact runway database (one line per runway) used to name the airports and runway of a flight.
internal sealed class RunwayDb
{
    private const double EarthRadiusM = 6371000;
    private const double MetresToFeet = 3.280839895;

    private sealed record End(
        string Airport, string Ident,
        double Lat, double Lon, double OtherLat, double OtherLon,
        double DisplacedM, double WidthM, double LengthM);

    private readonly List<End> _ends = new(32000);

    public int RunwayEnds => _ends.Count;

    public static RunwayDb LoadEmbedded()
    {
        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream("NavdeckLogbook.Data.runways.csv")
            ?? throw new InvalidOperationException("Embedded runway database not found.");
        using var reader = new StreamReader(stream);
        return Load(reader);
    }

    public static RunwayDb Load(TextReader reader)
    {
        var db = new RunwayDb();
        // airport,leIdent,leLat,leLon,leDispFt,heIdent,heLat,heLon,heDispFt,widthFt
        while (reader.ReadLine() is { } line)
        {
            var f = line.Split(',');
            if (f.Length < 10) continue;
            if (!Num(f[2], out var aLat) || !Num(f[3], out var aLon) ||
                !Num(f[6], out var bLat) || !Num(f[7], out var bLon)) continue;
            Num(f[4], out var aDisp);
            Num(f[8], out var bDisp);
            if (!Num(f[9], out var widthFt) || widthFt <= 0) widthFt = 150;

            var (e, n) = Vector(aLat, aLon, bLat, bLon);
            var length = Math.Sqrt(e * e + n * n);
            if (length < 100) continue;
            var widthM = widthFt / MetresToFeet;

            db._ends.Add(new End(f[0], f[1], aLat, aLon, bLat, bLon, aDisp / MetresToFeet, widthM, length));
            db._ends.Add(new End(f[0], f[5], bLat, bLon, aLat, aLon, bDisp / MetresToFeet, widthM, length));
        }
        return db;
    }

    // The airport whose runway ends are closest to the position (within maxKm). Airports with a
    // proper runway are preferred over small strips and heliports.
    public string? NearestAirport(double lat, double lon, double maxKm = 12)
    {
        string? bestMajor = null, bestAny = null;
        double dMajor = double.MaxValue, dAny = double.MaxValue;
        var maxM = maxKm * 1000;

        foreach (var end in _ends)
        {
            if (Math.Abs(end.Lat - lat) > maxKm / 111.0) continue;
            var (e, n) = Vector(lat, lon, end.Lat, end.Lon);
            var d = Math.Sqrt(e * e + n * n);
            if (d > maxM) continue;
            if (d < dAny) { dAny = d; bestAny = end.Airport; }
            if (end.LengthM >= 800 && d < dMajor) { dMajor = d; bestMajor = end.Airport; }
        }
        return bestMajor ?? bestAny;
    }

    // Looks up a runway end (used by the self-test to build a realistic flight).
    public (double Lat, double Lon, double OtherLat, double OtherLon)? FindEnd(string airport, string runway)
    {
        foreach (var end in _ends)
            if (end.Airport == airport && end.Ident == runway)
                return (end.Lat, end.Lon, end.OtherLat, end.OtherLon);
        return null;
    }

    // Matches a touchdown point to the runway the aircraft was lined up with.
    public RunwayMatch? Find(double lat, double lon, double approachTrackDeg)
    {
        if (!double.IsFinite(lat) || !double.IsFinite(lon) || !double.IsFinite(approachTrackDeg) ||
            Math.Abs(lat) > 90 || Math.Abs(lon) > 180)
            return null;

        List<RunwayMatch>? candidates = null;

        foreach (var end in _ends)
        {
            if (Math.Abs(lat - end.Lat) > 0.06) continue;

            var (rE, rN) = Vector(end.Lat, end.Lon, end.OtherLat, end.OtherLon);
            var length = end.LengthM;
            var (tE, tN) = Vector(end.Lat, end.Lon, lat, lon);

            var along = (tE * rE + tN * rN) / length;
            var lateral = (rN * tE - rE * tN) / length;   // + right of landing direction

            var bearing = (Math.Atan2(rE, rN) * 180 / Math.PI + 360) % 360;
            var diff = Math.Abs((bearing - approachTrackDeg + 540) % 360 - 180);
            if (diff > 30) continue;

            var thresholdDistance = along - end.DisplacedM;
            if (thresholdDistance < -100 || along > length + 100) continue;
            if (Math.Abs(lateral) > Math.Max(45, end.WidthM / 2 + 35)) continue;

            var score = Math.Abs(lateral) + diff * 2 +
                        (thresholdDistance < 0 ? Math.Abs(thresholdDistance) * 0.5 : 0);

            candidates ??= new List<RunwayMatch>();
            candidates.Add(new RunwayMatch(
                end.Airport, end.Ident,
                thresholdDistance * MetresToFeet,
                lateral * MetresToFeet,
                (length - end.DisplacedM) * MetresToFeet,
                end.WidthM * MetresToFeet,
                score));
        }

        if (candidates is null || candidates.Count == 0) return null;
        candidates.Sort((a, b) => a.Score.CompareTo(b.Score));

        // Two equally plausible runways: do not guess.
        if (candidates.Count > 1 && candidates[1].Score - candidates[0].Score < 12) return null;
        return candidates[0];
    }

    private static bool Num(string s, out double v) =>
        double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v) && double.IsFinite(v);

    private static (double East, double North) Vector(double lat1, double lon1, double lat2, double lon2)
    {
        var meanLat = (lat1 + lat2) / 2 * Math.PI / 180;
        var dLon = (lon2 - lon1 + 540) % 360 - 180;
        return (
            dLon * Math.PI / 180 * Math.Cos(meanLat) * EarthRadiusM,
            (lat2 - lat1) * Math.PI / 180 * EarthRadiusM);
    }
}
