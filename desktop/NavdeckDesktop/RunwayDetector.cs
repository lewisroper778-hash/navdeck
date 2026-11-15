using System.Globalization;
using System.Reflection;
using System.Text;

namespace NavdeckLink;

internal sealed record RunwayMatch(
    string Airport,
    string Runway,
    double DistanceFromThresholdM,
    double OffsetFromCentrelineM,
    double RunwayLengthM,
    double RunwayWidthM,
    double ConfidenceScore);

internal sealed class RunwayDetector
{
    private const double EarthRadiusM = 6371000;
    private readonly List<RunwayEnd> _ends = new();

    private sealed record RunwayEnd(
        string Airport,
        string Ident,
        double StartLat,
        double StartLon,
        double EndLat,
        double EndLon,
        double DisplacedM,
        double WidthM);

    public int RunwayEndsLoaded => _ends.Count;

    public RunwayDetector()
    {
        var assembly = Assembly.GetExecutingAssembly();

        using var stream = assembly.GetManifestResourceStream(
            "NavdeckLink.Data.runways.csv")
            ?? throw new InvalidOperationException(
                "Embedded runway database not found.");

        using var reader = new StreamReader(stream);

        var header = ParseCsv(reader.ReadLine() ?? "");
        var columns = header
            .Select((name, index) => (name, index))
            .ToDictionary(x => x.name, x => x.index);

        string Get(string[] fields, string name)
        {
            if (!columns.TryGetValue(name, out int index))
                return "";

            return index < fields.Length ? fields[index] : "";
        }

        double? Number(string[] fields, string name)
        {
            return double.TryParse(
                Get(fields, name),
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out double result) && double.IsFinite(result)
                    ? result : null;
        }

        while (reader.ReadLine() is { } line)
        {
            var fields = ParseCsv(line);

            if (Get(fields, "closed") == "1")
                continue;

            var aLat = Number(fields, "le_latitude_deg");
            var aLon = Number(fields, "le_longitude_deg");
            var bLat = Number(fields, "he_latitude_deg");
            var bLon = Number(fields, "he_longitude_deg");

            if (aLat is null || aLon is null ||
                bLat is null || bLon is null)
                continue;

            if (Math.Abs(aLat.Value) > 90 ||
                Math.Abs(bLat.Value) > 90 ||
                Math.Abs(aLon.Value) > 180 ||
                Math.Abs(bLon.Value) > 180)
                continue;

            var airport = Get(fields, "airport_ident");
            var aIdent = Get(fields, "le_ident");
            var bIdent = Get(fields, "he_ident");

            var widthM = (Number(fields, "width_ft") ?? 150)
                         * 0.3048;

            if (!string.IsNullOrWhiteSpace(aIdent))
                _ends.Add(new RunwayEnd(
                    airport, aIdent,
                    aLat.Value, aLon.Value,
                    bLat.Value, bLon.Value,
                    Math.Max(0, Number(fields,
                        "le_displaced_threshold_ft") ?? 0) * 0.3048,
                    widthM));

            if (!string.IsNullOrWhiteSpace(bIdent))
                _ends.Add(new RunwayEnd(
                    airport, bIdent,
                    bLat.Value, bLon.Value,
                    aLat.Value, aLon.Value,
                    Math.Max(0, Number(fields,
                        "he_displaced_threshold_ft") ?? 0) * 0.3048,
                    widthM));
        }
    }

    public RunwayMatch? Find(
        double touchdownLat,
        double touchdownLon,
        double approachTrackDeg)
    {
        if (!double.IsFinite(touchdownLat) ||
            !double.IsFinite(touchdownLon) ||
            !double.IsFinite(approachTrackDeg) ||
            Math.Abs(touchdownLat) > 90 ||
            Math.Abs(touchdownLon) > 180)
            return null;

        var candidates = new List<RunwayMatch>();

        foreach (var end in _ends)
        {
            // Fast latitude rejection: approximately 5 km.
            if (Math.Abs(touchdownLat - end.StartLat) > 0.05)
                continue;

            var (runwayEast, runwayNorth) = Vector(
                end.StartLat, end.StartLon,
                end.EndLat, end.EndLon);

            var length = Math.Sqrt(
                runwayEast * runwayEast +
                runwayNorth * runwayNorth);

            if (length < 100)
                continue;

            var (touchEast, touchNorth) = Vector(
                end.StartLat, end.StartLon,
                touchdownLat, touchdownLon);

            var along = (touchEast * runwayEast +
                         touchNorth * runwayNorth) / length;

            // Positive means right of the landing direction.
            var lateral = (runwayNorth * touchEast -
                           runwayEast * touchNorth) / length;

            var bearing = (Math.Atan2(
                runwayEast, runwayNorth)
                * 180 / Math.PI + 360) % 360;

            var difference = Math.Abs(
                (bearing - approachTrackDeg + 540) % 360 - 180);

            // Reject a runway inconsistent with the approach.
            if (difference > 30)
                continue;

            var thresholdDistance = along - end.DisplacedM;

            // Allow a small positioning margin.
            if (thresholdDistance < -100 ||
                along > length + 100)
                continue;

            var lateralLimit = Math.Max(
                45, end.WidthM / 2 + 35);

            if (Math.Abs(lateral) > lateralLimit)
                continue;

            var score =
                Math.Abs(lateral) +
                difference * 2 +
                (thresholdDistance < 0
                    ? Math.Abs(thresholdDistance) * 0.5 : 0);

            candidates.Add(new RunwayMatch(
                end.Airport,
                end.Ident,
                thresholdDistance,
                lateral,
                length,
                end.WidthM,
                score));
        }

        var ranked = candidates
            .OrderBy(x => x.ConfidenceScore)
            .ToList();

        if (ranked.Count == 0)
            return null;

        // Two comparably plausible runway matches
        // should not be resolved by guessing.
        if (ranked.Count > 1 &&
            ranked[1].ConfidenceScore -
            ranked[0].ConfidenceScore < 12)
            return null;

        return ranked[0];
    }

    private static (double East, double North) Vector(
        double lat1, double lon1,
        double lat2, double lon2)
    {
        var meanLat = (lat1 + lat2) / 2 * Math.PI / 180;

        var deltaLon = (lon2 - lon1 + 540) % 360 - 180;

        return (
            deltaLon * Math.PI / 180 *
                Math.Cos(meanLat) * EarthRadiusM,
            (lat2 - lat1) * Math.PI / 180 *
                EarthRadiusM);
    }

    private static string[] ParseCsv(string line)
    {
        var result = new List<string>();
        var field = new StringBuilder();
        bool quoted = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];

            if (c == '"')
            {
                if (quoted && i + 1 < line.Length &&
                    line[i + 1] == '"')
                {
                    field.Append('"');
                    i++;
                }
                else
                {
                    quoted = !quoted;
                }
            }
            else if (c == ',' && !quoted)
            {
                result.Add(field.ToString());
                field.Clear();
            }
            else
            {
                field.Append(c);
            }
        }

        result.Add(field.ToString());
        return result.ToArray();
    }
}
