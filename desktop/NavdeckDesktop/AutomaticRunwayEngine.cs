using System;

namespace NavdeckLink;

public readonly record struct RunwayGeometry(
    string RunwayDesignator,   // e.g., "24R", "09L"
    double ThresholdLat,       // Exact GPS Latitude of physical start
    double ThresholdLon,       // Exact GPS Longitude of physical start
    double HeadingTrueDeg,     // True heading of runway track
    double LengthFeet          // Runway length
);

public static class AutomaticRunwayEngine
{
    private const double EarthRadiusFeet = 20925646.3;

    public record TouchdownResult(string Runway, double DistanceAlongFeet, double LateralOffsetFeet);

    public static TouchdownResult? ProcessAutomaticLanding(double touchLat, double touchLon, double groundTrackDeg, RunwayGeometry[] availableRunways)
    {
        RunwayGeometry? matchedRunway = null;
        double closestDistance = double.MaxValue;

        foreach (var rwy in availableRunways)
        {
            double headingDelta = Math.Abs(groundTrackDeg - rwy.HeadingTrueDeg);
            if (headingDelta > 180) headingDelta = 360 - headingDelta;
            if (headingDelta > 20) continue;

            double dToThresh = ComputeDistanceFeet(touchLat, touchLon, rwy.ThresholdLat, rwy.ThresholdLon);
            if (dToThresh < closestDistance)
            {
                closestDistance = dToThresh;
                matchedRunway = rwy;
            }
        }

        if (matchedRunway == null) return null;

        var selected = matchedRunway.Value;

        double lat1 = selected.ThresholdLat * Math.PI / 180.0;
        double lon1 = selected.ThresholdLon * Math.PI / 180.0;
        double lat2 = touchLat * Math.PI / 180.0;
        double lon2 = touchLon * Math.PI / 180.0;
        double rwyHeadingRad = selected.HeadingTrueDeg * Math.PI / 180.0;

        double dLat = lat2 - lat1;
        double dLon = lon2 - lon1;
        
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(lat1) * Math.Cos(lat2) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        double angularDist = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        
        double y = Math.Sin(dLon) * Math.Cos(lat2);
        double x = Math.Cos(lat1) * Math.Sin(lat2) - Math.Sin(lat1) * Math.Cos(lat2) * Math.Cos(dLon);
        double bearingRad = Math.Atan2(y, x);

        double relativeAngle = bearingRad - rwyHeadingRad;
        double totalDistanceFeet = angularDist * EarthRadiusFeet;

        double distanceAlong = totalDistanceFeet * Math.Cos(relativeAngle);
        double lateralOffset = totalDistanceFeet * Math.Sin(relativeAngle);

        return new TouchdownResult(selected.RunwayDesignator, distanceAlong, lateralOffset);
    }

    private static double ComputeDistanceFeet(double lat1, double lon1, double lat2, double lon2)
    {
        double dLat = (lat2 - lat1) * Math.PI / 180.0;
        double dLon = (lon2 - lon1) * Math.PI / 180.0;
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                   Math.Cos(lat1 * Math.PI / 180.0) * Math.Cos(lat2 * Math.PI / 180.0) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return EarthRadiusFeet * (2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a)));
    }
}
