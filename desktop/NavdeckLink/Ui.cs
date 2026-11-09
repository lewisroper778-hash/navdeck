namespace NavdeckLink;

internal static class Theme
{
    public static readonly Color Bg = Color.FromArgb(2, 6, 23);
    public static readonly Color Card = Color.FromArgb(15, 23, 42);
    public static readonly Color Line = Color.FromArgb(30, 41, 59);
    public static readonly Color Text = Color.FromArgb(241, 245, 249);
    public static readonly Color Muted = Color.FromArgb(148, 163, 184);
    public static readonly Color Green = Color.FromArgb(16, 185, 129);
    public static readonly Color Amber = Color.FromArgb(245, 158, 11);
    public static readonly Color Red = Color.FromArgb(244, 63, 94);
    public static readonly Color Accent = Color.FromArgb(99, 102, 241);

    public static Button Button(string text, Color back, EventHandler onClick)
    {
        var b = new Button
        {
            Text = text, AutoSize = true, Padding = new Padding(10, 6, 10, 6), Margin = new Padding(0, 0, 8, 8),
            FlatStyle = FlatStyle.Flat, BackColor = back, ForeColor = Color.White, Cursor = Cursors.Hand,
            Font = new Font("Segoe UI Semibold", 9.5f),
        };
        b.FlatAppearance.BorderSize = 0;
        b.Click += onClick;
        return b;
    }

    public static Label Label(string text, float size = 9.5f, Color? color = null, bool bold = false) => new()
    {
        Text = text, AutoSize = true, ForeColor = color ?? Text,
        Font = new Font(bold ? "Segoe UI Semibold" : "Segoe UI", size), Margin = new Padding(0, 0, 0, 4),
    };
}

// Small prompt for pasting the NAVDECK connection code
internal sealed class CodeDialog : Form
{
    private readonly TextBox _box = new() { Width = 420, Font = new Font("Consolas", 9.5f), BackColor = Theme.Card, ForeColor = Theme.Text, BorderStyle = BorderStyle.FixedSingle };

    public string Code => _box.Text.Trim();

    public CodeDialog(string current)
    {
        Text = "Connect to NAVDECK";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Theme.Bg;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(16);
        _box.Text = current;
        var ok = Theme.Button("Connect", Theme.Accent, (_, _) =>
        {
            if (Config.IsValidCode(Code)) DialogResult = DialogResult.OK;
            else MessageBox.Show(this, "That doesn't look like a NAVDECK connection code. In NAVDECK open the SimBrief page → Simulator link → Create connection code, then copy it here.", "NAVDECK Link", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        });
        var layout = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, BackColor = Theme.Bg };
        layout.Controls.Add(Theme.Label("Paste your connection code", 11, bold: true));
        layout.Controls.Add(Theme.Label("NAVDECK → SimBrief page → Simulator link → Create connection code", 9, Theme.Muted));
        layout.Controls.Add(_box);
        layout.Controls.Add(ok);
        Controls.Add(layout);
        AcceptButton = ok;
    }
}
