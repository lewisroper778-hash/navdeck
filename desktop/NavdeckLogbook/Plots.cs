using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace NavdeckLogbook;

internal sealed class PlotTheme
{
    public Color Background { get; init; }
    public Color Text { get; init; }
    public Color Muted { get; init; }
    public Color Accent { get; init; }
    public Color Asphalt { get; init; }
    public Color Marking { get; init; }
    public Color Grid { get; init; }
    public Color Good { get; init; }
    public Color Bad { get; init; }

    public static readonly PlotTheme Dark = new()
    {
        Background = Color.FromArgb(20, 31, 50),
        Text = Color.FromArgb(230, 237, 247),
        Muted = Color.FromArgb(132, 150, 178),
        Accent = Color.FromArgb(0, 200, 235),
        Asphalt = Color.FromArgb(52, 60, 74),
        Marking = Color.FromArgb(225, 230, 238),
        Grid = Color.FromArgb(40, 56, 82),
        Good = Color.FromArgb(52, 211, 153),
        Bad = Color.FromArgb(248, 113, 113),
    };

    public static readonly PlotTheme Light = new()
    {
        Background = Color.White,
        Text = Color.FromArgb(24, 32, 46),
        Muted = Color.FromArgb(110, 122, 140),
        Accent = Color.FromArgb(0, 150, 190),
        Asphalt = Color.FromArgb(70, 76, 88),
        Marking = Color.White,
        Grid = Color.FromArgb(222, 228, 236),
        Good = Color.FromArgb(16, 150, 100),
        Bad = Color.FromArgb(214, 60, 60),
    };
}

// Draws the touchdown plotter, the flight track and the altitude profile into bitmaps.
// The same code feeds the on-screen cards and the PDF report.
internal static class Plots
{
    private static Graphics Begin(Bitmap bmp, PlotTheme t)
    {
        var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        g.Clear(t.Background);
        return g;
    }

    private static Font MakeFont(float px, bool bold = false) =>
        new("Segoe UI", px, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);

    private static void Text(Graphics g, string s, Font f, Color c, float x, float y, StringAlignment h = StringAlignment.Near)
    {
        using var brush = new SolidBrush(c);
        using var fmt = new StringFormat { Alignment = h, LineAlignment = StringAlignment.Near, FormatFlags = StringFormatFlags.NoWrap };
        g.DrawString(s, f, brush, x, y, fmt);
    }

    private static void Message(Graphics g, string s, int w, int h, PlotTheme t)
    {
        using var f = MakeFont(Math.Clamp(h / 12f, 11, 15));
        Text(g, s, f, t.Muted, w / 2f, h / 2f - f.Size / 2f, StringAlignment.Center);
    }

    // ---------------------------------------------------------------- touchdown plotter

    public static Bitmap TouchdownPlot(FlightRecord flight, int w, int h, PlotTheme t)
    {
        w = Math.Max(w, 200);
        h = Math.Max(h, 90);
        var bmp = new Bitmap(w, h);
        using var g = Begin(bmp, t);

        if (!flight.HasTouchdownPlot)
        {
            Message(g, flight.LandingUtc is null
                ? "Waiting for touchdown..."
                : "Runway not identified for this landing", w, h, t);
            return bmp;
        }

        var length = Math.Max(1000, flight.RunwayLengthFt ?? 8000);
        var width = Math.Max(60, flight.RunwayWidthFt ?? 150);
        var dist = Math.Clamp(flight.TouchdownDistanceFt ?? 0, 0, length);
        var offset = flight.TouchdownOffsetFt ?? 0;

        var fs = Math.Clamp(h / 13f, 10, 17);
        using var small = MakeFont(fs * 0.85f);
        using var normal = MakeFont(fs);
        using var bold = MakeFont(fs * 1.1f, true);

        float margin = Math.Max(18, w * 0.03f);
        float x0 = margin, x1 = w - margin;
        float sx = (x1 - x0) / (float)length;
        float bandH = Math.Clamp(h * 0.34f, 34, 80);
        float cy = h * 0.52f;
        float top = cy - bandH / 2, bottom = cy + bandH / 2;
        float sy = bandH / (float)width;

        // caption
        Text(g, $"RWY {flight.LandingRunway}  {flight.LandingAirport}", bold, t.Text, x0, 8);
        Text(g, $"{flight.TouchdownDistanceFt:N0} ft from threshold  |  {Fmt.Lateral(flight.TouchdownOffsetFt)}",
            normal, t.Muted, x1, 8, StringAlignment.Far);

        // runway surface
        using (var asphalt = new SolidBrush(t.Asphalt))
            g.FillRectangle(asphalt, x0, top, x1 - x0, bandH);

        // touchdown zone (first 3,000 ft) shading
        var zoneEnd = x0 + Math.Min(3000f, (float)length) * sx;
        using (var zone = new SolidBrush(Color.FromArgb(40, t.Good)))
            g.FillRectangle(zone, x0, top, zoneEnd - x0, bandH);

        using (var mark = new Pen(t.Marking, 1.5f))
        using (var dash = new Pen(t.Marking, 1.5f) { DashPattern = [8f, 8f] })
        {
            g.DrawRectangle(mark, x0, top, x1 - x0, bandH);
            g.DrawLine(dash, x0 + 40 * sx + 18, cy, x1 - 12, cy);

            // threshold bars
            for (var i = 0; i < 6; i++)
            {
                var yy = top + 6 + i * (bandH - 12) / 5f;
                g.DrawLine(mark, x0 + 4, yy, x0 + 16, yy);
            }
        }

        // aiming point (1,000 ft) and 500 ft marks
        using (var bar = new SolidBrush(t.Marking))
        {
            var aim = x0 + 1000f * sx;
            var barH = bandH * 0.22f;
            g.FillRectangle(bar, aim, cy - bandH * 0.3f - barH / 2, Math.Max(4, 150 * sx), barH);
            g.FillRectangle(bar, aim, cy + bandH * 0.3f - barH / 2, Math.Max(4, 150 * sx), barH);
        }

        // distance scale along the bottom
        var step = length >= 9000 ? 2000 : 1000;
        using (var tick = new Pen(t.Grid, 1f))
            for (var ft = 0; ft <= length; ft += step)
            {
                var x = x0 + ft * sx;
                g.DrawLine(tick, x, bottom, x, bottom + 6);
                Text(g, ft == 0 ? "THR" : $"{ft / 1000}k", small, t.Muted, x, bottom + 8, StringAlignment.Center);
            }

        // touchdown marker
        var px = x0 + (float)dist * sx;
        var py = Math.Clamp(cy + (float)offset * sy, top + 3, bottom - 3);
        using (var halo = new SolidBrush(Color.FromArgb(70, t.Bad)))
            g.FillEllipse(halo, px - 13, py - 13, 26, 26);
        using (var dot = new SolidBrush(t.Bad))
        using (var ring = new Pen(Color.White, 2f))
        {
            g.FillEllipse(dot, px - 6, py - 6, 12, 12);
            g.DrawEllipse(ring, px - 6, py - 6, 12, 12);
        }
        return bmp;
    }

    // ---------------------------------------------------------------- track

    public static Bitmap Track(FlightRecord flight, int w, int h, PlotTheme t)
    {
        w = Math.Max(w, 120);
        h = Math.Max(h, 80);
        var bmp = new Bitmap(w, h);
        using var g = Begin(bmp, t);

        var pts = flight.Track;
        if (pts.Count < 2)
        {
            Message(g, "No track recorded", w, h, t);
            return bmp;
        }

        double minLat = pts.Min(p => p.Lat), maxLat = pts.Max(p => p.Lat);
        double minLon = pts.Min(p => p.Lon), maxLon = pts.Max(p => p.Lon);
        var midLat = (minLat + maxLat) / 2;
        var kx = Math.Cos(midLat * Math.PI / 180);
        var spanX = Math.Max((maxLon - minLon) * kx, 0.02);
        var spanY = Math.Max(maxLat - minLat, 0.02);

        const float pad = 22;
        var scale = Math.Min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
        var offX = (w - spanX * scale) / 2;
        var offY = (h - spanY * scale) / 2;

        PointF P(double lat, double lon) => new(
            (float)(offX + (lon - minLon) * kx * scale),
            (float)(h - offY - (lat - minLat) * scale));

        var line = pts.Select(p => P(p.Lat, p.Lon)).ToArray();
        using (var pen = new Pen(t.Accent, 2.2f) { LineJoin = LineJoin.Round })
            g.DrawLines(pen, line);

        using var small = MakeFont(Math.Clamp(h / 15f, 9, 12));
        var routeFixes = flight.Waypoints.Where(x => x.IsRouteFix).ToList();
        using (var fixBrush = new SolidBrush(t.Muted))
            foreach (var wp in routeFixes)
            {
                var p = P(wp.Lat, wp.Lon);
                g.FillEllipse(fixBrush, p.X - 2.5f, p.Y - 2.5f, 5, 5);
                if (routeFixes.Count <= 14)
                    Text(g, wp.Ident, small, t.Muted, p.X + 4, p.Y - small.Size - 1);
            }

        using (var good = new SolidBrush(t.Good))
            g.FillEllipse(good, line[0].X - 5, line[0].Y - 5, 10, 10);
        using (var bad = new SolidBrush(t.Bad))
            g.FillEllipse(bad, line[^1].X - 5, line[^1].Y - 5, 10, 10);
        return bmp;
    }

    // ---------------------------------------------------------------- altitude profile

    public static Bitmap AltitudeProfile(FlightRecord flight, int w, int h, PlotTheme t)
    {
        w = Math.Max(w, 120);
        h = Math.Max(h, 80);
        var bmp = new Bitmap(w, h);
        using var g = Begin(bmp, t);

        var pts = flight.Track;
        if (pts.Count < 2)
        {
            Message(g, "No altitude data recorded", w, h, t);
            return bmp;
        }

        using var small = MakeFont(Math.Clamp(h / 15f, 9, 12));
        var maxAlt = Math.Max(pts.Max(p => p.AltFt), 1000);
        var gridStep = maxAlt > 30000 ? 10000 : maxAlt > 15000 ? 5000 : maxAlt > 6000 ? 2000 : 1000;
        var top = (int)Math.Ceiling(maxAlt / (double)gridStep) * gridStep;
        var maxSec = Math.Max(pts.Max(p => p.Seconds), 60);

        const float left = 44, right = 10, topPad = 10, bottomPad = 20;
        float pw = w - left - right, ph = h - topPad - bottomPad;

        PointF P(int sec, int alt) => new(
            left + sec / (float)maxSec * pw,
            topPad + ph - Math.Clamp(alt, 0, top) / (float)top * ph);

        using (var grid = new Pen(t.Grid, 1f))
            for (var a = 0; a <= top; a += gridStep)
            {
                var y = P(0, a).Y;
                g.DrawLine(grid, left, y, w - right, y);
                Text(g, $"{a:N0}", small, t.Muted, left - 4, y - small.Size / 2 - 1, StringAlignment.Far);
            }

        var hours = (int)Math.Ceiling(maxSec / 3600.0);
        var hourStep = hours > 8 ? 2 : 1;
        for (var hr = 0; hr * 3600 <= maxSec; hr += hourStep)
        {
            var x = P(hr * 3600, 0).X;
            Text(g, $"{hr}h", small, t.Muted, x, h - bottomPad + 4, StringAlignment.Center);
        }

        var line = pts.OrderBy(p => p.Seconds).Select(p => P(p.Seconds, p.AltFt)).ToList();
        var area = new List<PointF> { new(line[0].X, topPad + ph) };
        area.AddRange(line);
        area.Add(new PointF(line[^1].X, topPad + ph));
        using (var fill = new SolidBrush(Color.FromArgb(55, t.Accent)))
            g.FillPolygon(fill, area.ToArray());
        using (var pen = new Pen(t.Accent, 2f) { LineJoin = LineJoin.Round })
            g.DrawLines(pen, line.ToArray());
        return bmp;
    }

    public static byte[] ToPng(Bitmap bmp)
    {
        using var ms = new MemoryStream();
        bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        return ms.ToArray();
    }
}
