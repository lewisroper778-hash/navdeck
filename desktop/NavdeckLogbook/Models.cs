using System.Globalization;
using System.Text.Json;

namespace NavdeckLogbook;

// One fix passed (or checkpoint reached) during the flight.
internal sealed class WaypointLog
{
    public string Ident { get; set; } = "";
    public DateTime TimeUtc { get; set; }
    public int? FuelLb { get; set; }
    public int AltFt { get; set; }
    public double Lat { get; set; }
    public double Lon { get; set; }
    public bool IsRouteFix { get; set; }
}

// Down-sampled breadcrumb used for the track and altitude plots.
internal sealed class TrackPoint
{
    public double Lat { get; set; }
    public double Lon { get; set; }
    public int AltFt { get; set; }
    public int Seconds { get; set; } // since take-off
}

// Everything recorded about a single flight. Fuel is always stored in pounds.
internal sealed class FlightRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Callsign { get; set; } = "";
    public string Origin { get; set; } = "";
    public string Destination { get; set; } = "";
    public string Aircraft { get; set; } = "";
    public string Notes { get; set; } = "";

    public DateTime? GateOutUtc { get; set; }
    public DateTime? TakeoffUtc { get; set; }
    public DateTime? LandingUtc { get; set; }
    public DateTime? GateInUtc { get; set; }

    public int? FuelGateOutLb { get; set; }
    public int? FuelTakeoffLb { get; set; }
    public int? FuelLandingLb { get; set; }
    public int? FuelGateInLb { get; set; }

    public int? LandingRateFpm { get; set; }
    public int? TouchdownGroundSpeedKt { get; set; }
    public double? TouchdownLat { get; set; }
    public double? TouchdownLon { get; set; }
    public string LandingAirport { get; set; } = "";
    public string LandingRunway { get; set; } = "";
    public double? TouchdownDistanceFt { get; set; }   // from the threshold
    public double? TouchdownOffsetFt { get; set; }     // + right of centreline
    public double? RunwayLengthFt { get; set; }
    public double? RunwayWidthFt { get; set; }

    public int MaxAltitudeFt { get; set; }
    public int GoArounds { get; set; }

    public List<WaypointLog> Waypoints { get; set; } = [];
    public List<TrackPoint> Track { get; set; } = [];

    public DateTime? StartUtc => GateOutUtc ?? TakeoffUtc ?? LandingUtc ?? GateInUtc;
    public TimeSpan? BlockTime => GateOutUtc is { } o && GateInUtc is { } i ? i - o : null;
    public TimeSpan? AirTime => TakeoffUtc is { } t && LandingUtc is { } l ? l - t : null;
    public int? FuelBurnedLb =>
        FuelGateOutLb is { } a && FuelGateInLb is { } b && a >= b ? a - b : null;
    public bool HasTouchdownPlot => TouchdownDistanceFt.HasValue && RunwayLengthFt.HasValue;

    public string RouteText =>
        (string.IsNullOrWhiteSpace(Origin) ? "????" : Origin) + " - " +
        (string.IsNullOrWhiteSpace(Destination) ? "????" : Destination);
}

internal sealed class AppSettings
{
    public string FuelUnit { get; set; } = "lb";     // lb or kg
    public string SimBriefUser { get; set; } = "";    // optional: username or numeric pilot id
    public bool PromptForPdf { get; set; } = true;    // offer a PDF when the flight ends
    public string PdfFolder { get; set; } = "";       // last folder used for PDFs
    public bool TrayHintShown { get; set; }

    public bool UseKg => FuelUnit == "kg";
}

internal static class Fmt
{
    public const double LbToKg = 0.45359237;

    public static string Time(DateTime? t) => t is { } v ? v.ToString("HH:mm:ss", CultureInfo.InvariantCulture) + "z" : "--:--";
    public static string ShortTime(DateTime? t) => t is { } v ? v.ToString("HH:mm", CultureInfo.InvariantCulture) + "z" : "--:--";
    public static string Date(DateTime? t) => t is { } v ? v.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) : "";

    public static string Duration(TimeSpan? d)
    {
        if (d is not { } v || v < TimeSpan.Zero) return "--:--";
        return $"{(int)v.TotalHours}:{v.Minutes:00}";
    }

    public static string Fuel(int? lb, bool kg)
    {
        if (lb is not { } v) return "--";
        return kg ? $"{v * LbToKg:N0} kg" : $"{v:N0} lb";
    }

    public static string Feet(double? ft) => ft is { } v ? $"{v:N0} ft" : "--";

    public static string Lateral(double? ft)
    {
        if (ft is not { } v) return "--";
        if (Math.Abs(v) < 0.5) return "on centreline";
        return $"{Math.Abs(v):N0} ft {(v > 0 ? "right" : "left")}";
    }

    public static string RateText(int? fpm) => fpm is { } v ? $"{v:N0} fpm" : "--";

    public static string RateRating(int? fpm) => fpm switch
    {
        null => "",
        < 120 => "Butter",
        < 250 => "Smooth",
        < 400 => "Normal",
        < 600 => "Firm",
        < 800 => "Hard",
        _ => "Very hard",
    };

    public static string FileSafe(string s)
    {
        foreach (var c in Path.GetInvalidFileNameChars()) s = s.Replace(c, '_');
        return s.Trim();
    }
}

internal static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        PropertyNameCaseInsensitive = true,
    };
}
