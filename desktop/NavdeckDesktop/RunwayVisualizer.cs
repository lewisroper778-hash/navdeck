using System;
using System.Drawing;
using System.Windows.Forms;

namespace NavdeckLink;

internal sealed class RunwayVisualizer : Panel
{
    private RunwayMatch? _touchdown;
    private bool _hasLanding;

    public RunwayVisualizer()
    {
        DoubleBuffered = true;
        Height = 180;
        Dock = DockStyle.Fill;
        BackColor = Theme.Card;
    }

    public void UpdateTouchdown(RunwayMatch? result)
    {
        _touchdown = result;
        _hasLanding = result != null;
        Invalidate(); // Triggers a redraw of the canvas
    }

    public void Clear()
    {
        _hasLanding = false;
        _touchdown = null;
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        // Draw Card Title
        using (var titleFont = new Font("Segoe UI", 9f, FontStyle.Bold))
        {
            g.DrawString("AUTOMATIC TOUCHDOWN PLOTTER", titleFont, System.Drawing.Brushes.Cyan, new PointF(12, 12));
        }

        // Define Runway Dimensions relative to the control size
        // Keep the entire runway within the visible panel.
        const int horizontalPadding = 48;
        const int runwayHeight = 44;

        int rwWidth = Math.Max(1, Width - horizontalPadding * 2);
        int rwHeight = Math.Min(runwayHeight, Math.Max(1, Height - 95));
        int rwX = horizontalPadding;
        int rwY = Math.Max(38, (Height - rwHeight) / 2);

        // 1. Draw Runway Surface Asphalt
        using (var rwyBrush = new SolidBrush(Color.FromArgb(45, 45, 48)))
        {
            g.FillRectangle(rwyBrush, rwX, rwY, rwWidth, rwHeight);
        }

        // 2. Draw Runway Threshold Stripes (Start of runway)
        using (var linePen = new Pen(Color.White, 2f))
        {
            g.DrawRectangle(linePen, rwX, rwY, rwWidth, rwHeight);

            // Centerline dashed marker marks
            using (var dashPen = new Pen(Color.White, 2f) { DashPattern = new float[] { 8, 8 } })
            {
                g.DrawLine(dashPen, rwX, rwY + (rwHeight / 2), rwX + rwWidth, rwY + (rwHeight / 2));
            }
        }

        // 3. Plot Touchdown Event if registered
        if (_hasLanding && _touchdown != null)
        {
            var td = _touchdown;

            // Map physical feet measurements to UI pixel scale
            // Let's assume standard runway bounding length scale represents 10,000 feet max length
            double scaleX = (double)rwWidth / (td.RunwayLengthM / 0.3048);
            double scaleY = (double)rwHeight / (td.RunwayWidthM / 0.3048); // Assume 150ft standard width limits

            int pointX = rwX + (int)((td.DistanceFromThresholdM / 0.3048) * scaleX);
            int pointY = rwY + (rwHeight / 2) - (int)((td.OffsetFromCentrelineM / 0.3048) * scaleY);

            // Keep bounds within physical runway drawing limit boundaries
            if (pointX < rwX) pointX = rwX;
            if (pointX > rwX + rwWidth) pointX = rwX + rwWidth;
            if (pointY < rwY) pointY = rwY;
            if (pointY > rwY + rwHeight) pointY = rwY + rwHeight;

            // Draw Red Target crosshair Marker dot
            g.FillEllipse(Brushes.Crimson, pointX - 6, pointY - 6, 12, 12);
            g.DrawEllipse(Pens.White, pointX - 6, pointY - 6, 12, 12);

            // Draw Telemetry Text overlay details summary metrics on the canvas
            using (var textFont = new Font("Segoe UI", 9.5f, FontStyle.Regular))
            {
                string info = $"Rwy {td.Runway}  |  Threshold Distance: +{(td.DistanceFromThresholdM / 0.3048):N0} ft  |  Centerline Offset: {(td.OffsetFromCentrelineM / 0.3048):F1} ft";
                g.DrawString(info, textFont, System.Drawing.Brushes.White, new PointF(12, Height - 28));
            }
        }
        else
        {
            using (var textFont = new Font("Segoe UI", 9.5f, FontStyle.Italic))
            {
                g.DrawString("Waiting for aircraft landing wheels contact...", textFont, System.Drawing.Brushes.LightGray, new PointF(12, Height - 28));
            }
        }
    }
}
