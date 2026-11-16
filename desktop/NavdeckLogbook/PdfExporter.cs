using PdfSharp;
using PdfSharp.Drawing;
using PdfSharp.Pdf;

namespace NavdeckLogbook;

// Writes a one-flight PDF report: times, fuel, landing rate, touchdown plot, track, altitude profile and waypoints.
internal static class PdfExporter
{
    private const double PageW = 595.276, PageH = 841.89, Margin = 36;
    private const double ContentW = PageW - 2 * Margin;

    private static readonly XColor Navy = XColor.FromArgb(13, 27, 42);
    private static readonly XColor Cyan = XColor.FromArgb(0, 150, 190);
    private static readonly XColor Ink = XColor.FromArgb(24, 32, 46);
    private static readonly XColor Gray = XColor.FromArgb(110, 122, 140);
    private static readonly XColor Tile = XColor.FromArgb(243, 246, 249);
    private static readonly XColor Rule = XColor.FromArgb(214, 221, 230);

    public static void Export(FlightRecord f, string path, bool kg)
    {
        var doc = new PdfDocument();
        doc.Info.Title = $"NAVDECK flight log {f.RouteText}";
        doc.Info.Author = "NAVDECK Logbook";

        var images = new List<XImage>();
        try
        {
            var page = doc.AddPage();
            page.Size = PageSize.A4;
            using (var g = XGraphics.FromPdfPage(page))
                FirstPage(g, f, kg, images);

            if (f.Waypoints.Count > 0)
                WaypointPages(doc, f, kg);

            AddFooters(doc, f);
            doc.Save(path);
        }
        finally
        {
            foreach (var img in images) img.Dispose();
            doc.Dispose();
        }
    }

    // ---------------------------------------------------------------- page 1

    private static void FirstPage(XGraphics g, FlightRecord f, bool kg, List<XImage> images)
    {
        var title = new XFont("Arial", 20, XFontStyleEx.Bold);
        var big = new XFont("Arial", 30, XFontStyleEx.Bold);
        var label = new XFont("Arial", 8, XFontStyleEx.Bold);
        var body = new XFont("Arial", 10, XFontStyleEx.Regular);
        var bodyBold = new XFont("Arial", 10, XFontStyleEx.Bold);
        var value = new XFont("Arial", 16, XFontStyleEx.Bold);
        var section = new XFont("Arial", 9, XFontStyleEx.Bold);

        // header band
        g.DrawRectangle(new XSolidBrush(Navy), 0, 0, PageW, 64);
        g.DrawString("NAVDECK", title, XBrushes.White, Margin, 20, XStringFormats.TopLeft);
        g.DrawString("FLIGHT LOG", new XFont("Arial", 11, XFontStyleEx.Bold), new XSolidBrush(XColor.FromArgb(0, 200, 235)),
            new XRect(Margin, 25, ContentW, 20), XStringFormats.TopRight);

        // route
        var originText = string.IsNullOrWhiteSpace(f.Origin) ? "????" : f.Origin;
        var destText = string.IsNullOrWhiteSpace(f.Destination) ? "????" : f.Destination;
        var y = 84.0;
        g.DrawString(originText, big, new XSolidBrush(Ink), Margin, y, XStringFormats.TopLeft);
        var fromW = g.MeasureString(originText, big).Width;
        var arrowX = Margin + fromW + 14;
        var arrowY = y + 20;
        var arrowPen = new XPen(Cyan, 2.2);
        g.DrawLine(arrowPen, arrowX, arrowY, arrowX + 34, arrowY);
        g.DrawLine(arrowPen, arrowX + 34, arrowY, arrowX + 27, arrowY - 6);
        g.DrawLine(arrowPen, arrowX + 34, arrowY, arrowX + 27, arrowY + 6);
        g.DrawString(destText, big, new XSolidBrush(Ink), arrowX + 48, y, XStringFormats.TopLeft);

        var sub = string.Join("   |   ", new[] { f.Callsign, f.Aircraft, Fmt.Date(f.StartUtc) }
            .Where(s => !string.IsNullOrWhiteSpace(s)));
        g.DrawString(sub, body, new XSolidBrush(Gray), Margin, y + 42, XStringFormats.TopLeft);

        // summary tiles
        y = 150;
        var tileW = (ContentW - 3 * 10) / 4;
        var tiles = new (string Label, string Value)[]
        {
            ("BLOCK TIME", Fmt.Duration(f.BlockTime)),
            ("AIR TIME", Fmt.Duration(f.AirTime)),
            ("FUEL BURNED", Fmt.Fuel(f.FuelBurnedLb, kg)),
            ("LANDING RATE", f.LandingRateFpm is { } r ? $"{r:N0} fpm" : "--"),
        };
        for (var i = 0; i < tiles.Length; i++)
        {
            var x = Margin + i * (tileW + 10);
            g.DrawRectangle(new XSolidBrush(Tile), x, y, tileW, 54);
            g.DrawString(tiles[i].Label, label, new XSolidBrush(Gray), x + 10, y + 9, XStringFormats.TopLeft);
            g.DrawString(tiles[i].Value, value, new XSolidBrush(Ink), x + 10, y + 26, XStringFormats.TopLeft);
        }
        if (Fmt.RateRating(f.LandingRateFpm) is { Length: > 0 } rating)
            g.DrawString(rating, new XFont("Arial", 8, XFontStyleEx.Bold), new XSolidBrush(Cyan),
                new XRect(Margin + 3 * (tileW + 10) + 10, y + 9, tileW - 20, 12), XStringFormats.TopRight);

        // times and fuel table
        y = 226;
        SectionTitle(g, "TIMES AND FUEL", y, section);
        y += 22;
        double c0 = Margin, c1 = Margin + 110, c2 = Margin + 200, c3 = Margin + 290;
        g.DrawString("EVENT", label, new XSolidBrush(Gray), c0, y, XStringFormats.TopLeft);
        g.DrawString("TIME (UTC)", label, new XSolidBrush(Gray), c1, y, XStringFormats.TopLeft);
        g.DrawString("FUEL", label, new XSolidBrush(Gray), c2, y, XStringFormats.TopLeft);
        g.DrawString("USED", label, new XSolidBrush(Gray), c3, y, XStringFormats.TopLeft);
        y += 14;

        var events = new (string Name, DateTime? Time, int? Fuel)[]
        {
            ("Gate out", f.GateOutUtc, f.FuelGateOutLb),
            ("Take-off", f.TakeoffUtc, f.FuelTakeoffLb),
            ("Landing", f.LandingUtc, f.FuelLandingLb),
            ("Gate in", f.GateInUtc, f.FuelGateInLb),
        };
        foreach (var e in events)
        {
            g.DrawLine(new XPen(Rule, 0.7), Margin, y - 2, Margin + 380, y - 2);
            g.DrawString(e.Name, bodyBold, new XSolidBrush(Ink), c0, y + 2, XStringFormats.TopLeft);
            g.DrawString(Fmt.Time(e.Time), body, new XSolidBrush(Ink), c1, y + 2, XStringFormats.TopLeft);
            g.DrawString(Fmt.Fuel(e.Fuel, kg), body, new XSolidBrush(Ink), c2, y + 2, XStringFormats.TopLeft);
            var used = f.FuelGateOutLb is { } start && e.Fuel is { } now && start >= now ? start - now : (int?)null;
            g.DrawString(e.Name == "Gate out" ? "" : Fmt.Fuel(used, kg), body, new XSolidBrush(Gray), c3, y + 2, XStringFormats.TopLeft);
            y += 20;
        }

        // extra facts, right of the table
        var facts = new (string Name, string Val)[]
        {
            ("Max altitude", f.MaxAltitudeFt > 0 ? $"{f.MaxAltitudeFt:N0} ft" : "--"),
            ("Touchdown G/S", f.TouchdownGroundSpeedKt is { } gs ? $"{gs} kt" : "--"),
            ("Go-arounds", f.GoArounds.ToString()),
        };
        var fx = Margin + 410;
        var fy = 248.0;
        foreach (var (name, val) in facts)
        {
            g.DrawString(name.ToUpperInvariant(), label, new XSolidBrush(Gray), fx, fy, XStringFormats.TopLeft);
            g.DrawString(val, bodyBold, new XSolidBrush(Ink), fx, fy + 11, XStringFormats.TopLeft);
            fy += 30;
        }

        // touchdown plotter
        y = 352;
        SectionTitle(g, "LANDING AND TOUCHDOWN PLOTTER", y, section);
        y += 22;
        const double plotH = 150;
        using (var bmp = Plots.TouchdownPlot(f, (int)(ContentW * 3), (int)(plotH * 3), PlotTheme.Light))
            DrawBitmap(g, bmp, Margin, y, ContentW, plotH, images);
        y += plotH + 8;

        var landing = f.LandingRunway.Length > 0
            ? $"Runway {f.LandingRunway} at {f.LandingAirport}   |   {Fmt.Feet(f.TouchdownDistanceFt)} from the threshold   |   {Fmt.Lateral(f.TouchdownOffsetFt)}"
            : "Runway could not be identified for this landing";
        g.DrawString(landing, body, new XSolidBrush(Ink), Margin, y, XStringFormats.TopLeft);

        // track and altitude profile
        y = 560;
        var half = (ContentW - 14) / 2;
        SectionTitle(g, "FLIGHT TRACK", y, section, Margin, half);
        SectionTitle(g, "ALTITUDE PROFILE (FT)", y, section, Margin + half + 14, half);
        y += 22;
        const double mapH = 170;
        using (var bmp = Plots.Track(f, (int)(half * 3), (int)(mapH * 3), PlotTheme.Light))
            DrawBitmap(g, bmp, Margin, y, half, mapH, images);
        using (var bmp = Plots.AltitudeProfile(f, (int)(half * 3), (int)(mapH * 3), PlotTheme.Light))
            DrawBitmap(g, bmp, Margin + half + 14, y, half, mapH, images);

        if (f.Waypoints.Count > 0)
            g.DrawString($"{f.Waypoints.Count} waypoint{(f.Waypoints.Count == 1 ? "" : "s")} logged, listed on the next page.",
                body, new XSolidBrush(Gray), Margin, y + mapH + 14, XStringFormats.TopLeft);
    }

    private static void DrawBitmap(XGraphics g, System.Drawing.Bitmap bmp, double x, double y, double w, double h, List<XImage> keep)
    {
        var image = XImage.FromStream(new MemoryStream(Plots.ToPng(bmp)));
        keep.Add(image);
        g.DrawImage(image, x, y, w, h);
        g.DrawRectangle(new XPen(Rule, 0.7), x, y, w, h);
    }

    private static void SectionTitle(XGraphics g, string text, double y, XFont font, double x = Margin, double width = ContentW)
    {
        g.DrawString(text, font, new XSolidBrush(Cyan), x, y, XStringFormats.TopLeft);
        g.DrawLine(new XPen(Rule, 0.8), x, y + 14, x + width, y + 14);
    }

    // ---------------------------------------------------------------- waypoints (page 2+)

    private static void WaypointPages(PdfDocument doc, FlightRecord f, bool kg)
    {
        var label = new XFont("Arial", 8, XFontStyleEx.Bold);
        var body = new XFont("Arial", 10, XFontStyleEx.Regular);
        var bodyBold = new XFont("Arial", 10, XFontStyleEx.Bold);
        var section = new XFont("Arial", 9, XFontStyleEx.Bold);
        const double rowH = 18, bottomLimit = PageH - 60;

        var index = 0;
        var first = true;
        while (index < f.Waypoints.Count)
        {
            var page = doc.AddPage();
            page.Size = PageSize.A4;
            using var g = XGraphics.FromPdfPage(page);

            var y = Margin;
            SectionTitle(g, first ? $"WAYPOINTS  |  {f.RouteText}" : "WAYPOINTS (CONTINUED)", y, section);
            y += 24;
            first = false;

            double c0 = Margin, c1 = Margin + 34, c2 = Margin + 170, c3 = Margin + 270, c4 = Margin + 380;
            foreach (var (text, x) in new[] { ("#", c0), ("WAYPOINT", c1), ("TIME (UTC)", c2), ("ALTITUDE", c3), ("FUEL", c4) })
                g.DrawString(text, label, new XSolidBrush(Gray), x, y, XStringFormats.TopLeft);
            g.DrawString("USED SINCE TAKE-OFF", label, new XSolidBrush(Gray), new XRect(Margin, y, ContentW, 12), XStringFormats.TopRight);
            y += 16;

            while (index < f.Waypoints.Count && y + rowH < bottomLimit)
            {
                var w = f.Waypoints[index];
                if (index % 2 == 0)
                    g.DrawRectangle(new XSolidBrush(Tile), Margin, y - 2, ContentW, rowH);

                g.DrawString((index + 1).ToString(), body, new XSolidBrush(Gray), c0 + 2, y, XStringFormats.TopLeft);
                g.DrawString(w.Ident, bodyBold, new XSolidBrush(Ink), c1, y, XStringFormats.TopLeft);
                g.DrawString(Fmt.Time(w.TimeUtc), body, new XSolidBrush(Ink), c2, y, XStringFormats.TopLeft);
                g.DrawString($"{w.AltFt:N0} ft", body, new XSolidBrush(Ink), c3, y, XStringFormats.TopLeft);
                g.DrawString(Fmt.Fuel(w.FuelLb, kg), body, new XSolidBrush(Ink), c4, y, XStringFormats.TopLeft);

                var used = f.FuelTakeoffLb is { } start && w.FuelLb is { } now && start >= now ? start - now : (int?)null;
                g.DrawString(Fmt.Fuel(used, kg), body, new XSolidBrush(Gray), new XRect(Margin, y, ContentW - 4, 14), XStringFormats.TopRight);
                y += rowH;
                index++;
            }
        }
    }

    // ---------------------------------------------------------------- footers

    private static void AddFooters(PdfDocument doc, FlightRecord f)
    {
        var small = new XFont("Arial", 8, XFontStyleEx.Regular);
        for (var i = 0; i < doc.PageCount; i++)
        {
            using var g = XGraphics.FromPdfPage(doc.Pages[i]);
            g.DrawLine(new XPen(Rule, 0.7), Margin, PageH - 40, PageW - Margin, PageH - 40);
            g.DrawString($"Generated by NAVDECK Logbook   |   {f.RouteText}   |   Fuel and times recorded automatically from the simulator",
                small, new XSolidBrush(Gray), Margin, PageH - 32, XStringFormats.TopLeft);
            g.DrawString($"Page {i + 1} of {doc.PageCount}", small, new XSolidBrush(Gray),
                new XRect(Margin, PageH - 32, ContentW, 12), XStringFormats.TopRight);
        }
    }
}
