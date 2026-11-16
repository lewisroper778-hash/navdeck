using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace NavdeckLogbook;

internal static class Theme
{
    public static readonly Color Bg = Color.FromArgb(11, 18, 32);
    public static readonly Color Card = Color.FromArgb(20, 31, 50);
    public static readonly Color CardAlt = Color.FromArgb(24, 36, 58);
    public static readonly Color Border = Color.FromArgb(36, 52, 78);
    public static readonly Color Text = Color.FromArgb(230, 237, 247);
    public static readonly Color Muted = Color.FromArgb(132, 150, 178);
    public static readonly Color Accent = Color.FromArgb(0, 200, 235);
    public static readonly Color AccentDim = Color.FromArgb(14, 78, 100);
    public static readonly Color Good = Color.FromArgb(52, 211, 153);
    public static readonly Color Warn = Color.FromArgb(251, 191, 36);
    public static readonly Color Bad = Color.FromArgb(248, 113, 113);

    public static Font Ui(float size, bool bold = false) =>
        new("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Point);

    public static Label Lbl(string text, float size = 9.5f, Color? color = null, bool bold = false,
                              ContentAlignment align = ContentAlignment.MiddleLeft) => new()
    {
        Text = text,
        Font = Ui(size, bold),
        ForeColor = color ?? Text,
        BackColor = Color.Transparent,
        AutoSize = false,
        Dock = DockStyle.Fill,
        TextAlign = align,
        UseMnemonic = false,
        AutoEllipsis = true,
    };

    public static Button Btn(string text, bool primary = false) => new()
    {
        Text = text,
        Font = Ui(9.5f, true),
        ForeColor = primary ? Color.FromArgb(5, 15, 28) : Text,
        BackColor = primary ? Accent : Border,
        FlatStyle = FlatStyle.Flat,
        FlatAppearance = { BorderSize = 0, MouseOverBackColor = primary ? Color.FromArgb(70, 220, 245) : Color.FromArgb(52, 72, 104) },
        Cursor = Cursors.Hand,
        Height = 36,
        Padding = new Padding(10, 0, 10, 0),
        UseVisualStyleBackColor = false,
    };

    public static void SetText(Label label, string text)
    {
        if (label.Text != text) label.Text = text;
    }
}

// A rounded panel with a small caption.
internal sealed class Card : Panel
{
    private readonly string _title;

    public Card(string title)
    {
        _title = title;
        DoubleBuffered = true;
        BackColor = Theme.Card;
        Padding = new Padding(16, title.Length > 0 ? 34 : 14, 16, 14);
        Margin = new Padding(0, 0, 0, 12);
        ResizeRedraw = true;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        using var path = Rounded(new Rectangle(0, 0, Width - 1, Height - 1), 10);
        using (var fill = new SolidBrush(Theme.Card)) g.FillPath(fill, path);
        using (var pen = new Pen(Theme.Border)) g.DrawPath(pen, path);
        if (_title.Length > 0)
        {
            using var font = Theme.Ui(8f, true);
            using var brush = new SolidBrush(Theme.Muted);
            g.DrawString(_title, font, brush, 16, 11);
        }
    }

    public static GraphicsPath Rounded(Rectangle r, int radius)
    {
        var d = radius * 2;
        var p = new GraphicsPath();
        p.AddArc(r.X, r.Y, d, d, 180, 90);
        p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}

// Parked - Taxi out - Airborne - Taxi in - Arrived
internal sealed class PhaseBar : Control
{
    private static readonly string[] Names = ["PARKED", "TAXI OUT", "AIRBORNE", "TAXI IN", "ARRIVED"];
    private int _progress;

    public PhaseBar()
    {
        DoubleBuffered = true;
        Height = 46;
        BackColor = Color.Transparent;
    }

    public int Progress
    {
        get => _progress;
        set
        {
            if (_progress == value) return;
            _progress = value;
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        using var font = Theme.Ui(8f, true);
        var n = Names.Length;
        var left = 30f;
        var right = Width - 30f;
        var step = (right - left) / (n - 1);
        var y = 12f;

        using (var rail = new Pen(Theme.Border, 3f))
            g.DrawLine(rail, left, y, right, y);
        using (var done = new Pen(Theme.Accent, 3f))
            g.DrawLine(done, left, y, left + step * Math.Min(_progress, n - 1), y);

        for (var i = 0; i < n; i++)
        {
            var x = left + step * i;
            var reached = i <= _progress;
            using var dot = new SolidBrush(reached ? Theme.Accent : Theme.Border);
            g.FillEllipse(dot, x - 6, y - 6, 12, 12);
            if (i == _progress)
                using (var ring = new Pen(Theme.Accent, 2f))
                    g.DrawEllipse(ring, x - 10, y - 10, 20, 20);
            using var text = new SolidBrush(reached ? Theme.Text : Theme.Muted);
            using var fmt = new StringFormat { Alignment = StringAlignment.Center };
            g.DrawString(Names[i], font, text, x, y + 14, fmt);
        }
    }
}

// Shows the touchdown plot for the flight on screen.
internal sealed class PlotterPanel : Control
{
    private Bitmap? _bmp;
    private FlightRecord? _flight;
    private string _key = "";

    public PlotterPanel()
    {
        DoubleBuffered = true;
        BackColor = Theme.Card;
        ResizeRedraw = true;
    }

    public void SetFlight(FlightRecord? flight)
    {
        var key = flight is null
            ? "none"
            : $"{flight.Id}|{flight.LandingUtc?.Ticks}|{flight.LandingRunway}|{flight.TouchdownDistanceFt}|{flight.TouchdownOffsetFt}";
        if (key == _key) return;
        _key = key;
        _flight = flight;
        Rebuild();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        Rebuild();
    }

    private void Rebuild()
    {
        var old = _bmp;
        _bmp = null;
        if (_flight is not null && Width > 50 && Height > 40)
            _bmp = Plots.TouchdownPlot(_flight, Width, Height, PlotTheme.Dark);
        old?.Dispose();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        if (_bmp is not null) e.Graphics.DrawImageUnscaled(_bmp, 0, 0);
        else e.Graphics.Clear(Theme.Card);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _bmp?.Dispose();
        base.Dispose(disposing);
    }
}

// A dark, flicker-free details list.
internal sealed class DarkList : ListView
{
    private static readonly Font HeaderFont = Theme.Ui(8f, true);

    public DarkList()
    {
        DoubleBuffered = true;
        View = View.Details;
        FullRowSelect = true;
        HideSelection = false;
        MultiSelect = false;
        BorderStyle = BorderStyle.None;
        OwnerDraw = true;
        BackColor = Theme.Card;
        ForeColor = Theme.Text;
        Font = Theme.Ui(9.5f);
        HeaderStyle = ColumnHeaderStyle.Nonclickable;
        SmallImageList = new ImageList { ImageSize = new Size(1, 28) };   // sets the row height
    }

    protected override void OnDrawColumnHeader(DrawListViewColumnHeaderEventArgs e)
    {
        using var bg = new SolidBrush(Theme.Bg);
        e.Graphics.FillRectangle(bg, e.Bounds);
        TextRenderer.DrawText(e.Graphics, e.Header?.Text ?? "", HeaderFont,
            Rectangle.Inflate(e.Bounds, -6, 0), Theme.Muted,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
    }

    protected override void OnDrawItem(DrawListViewItemEventArgs e)
    {
        // Cells are drawn in OnDrawSubItem.
    }

    protected override void OnDrawSubItem(DrawListViewSubItemEventArgs e)
    {
        var selected = e.Item?.Selected == true;
        using var bg = new SolidBrush(selected ? Theme.AccentDim : (e.ItemIndex % 2 == 0 ? Theme.Card : Theme.CardAlt));
        e.Graphics.FillRectangle(bg, e.Bounds);
        TextRenderer.DrawText(e.Graphics, e.SubItem?.Text ?? "", Font,
            Rectangle.Inflate(e.Bounds, -6, 0), Theme.Text,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
    }
}
