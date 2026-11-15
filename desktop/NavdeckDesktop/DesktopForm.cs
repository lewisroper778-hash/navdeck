using Microsoft.Web.WebView2.WinForms;

namespace NavdeckLink;

internal sealed class DesktopForm : Form
{
    private readonly WebView2 _browser = new();
    private readonly Label _status = new()
    {
        Text = "NAVDECK Desktop",
        AutoSize = true,
        ForeColor = Color.White,
        BackColor = Color.Transparent
    };

    public DesktopForm()
    {
        Text = "NAVDECK Desktop";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1000, 700);
        BackColor = Color.FromArgb(12, 17, 27);

        var toolbar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 48,
            BackColor = Color.FromArgb(20, 27, 40)
        };

        _status.Location = new Point(18, 16);
        toolbar.Controls.Add(_status);

        var bridgeButton = new Button
        {
            Text = "SIMULATOR CONNECTION",
            Dock = DockStyle.Right,
            Width = 210,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(30, 44, 66),
            ForeColor = Color.White
        };

        bridgeButton.Click += (_, _) =>
        {
            var bridge = new MainForm(false);
            bridge.Show(this);
        };

        toolbar.Controls.Add(bridgeButton);

        _browser.Dock = DockStyle.Fill;
        Controls.Add(_browser);
        Controls.Add(toolbar);

        Shown += async (_, _) =>
        {
            try
            {
                await _browser.EnsureCoreWebView2Async();
                _browser.CoreWebView2.Settings.AreDevToolsEnabled = false;
                _browser.CoreWebView2.Navigate(
                    "https://test.navdeck.online"
                );
                _status.Text = "NAVDECK Desktop | Connected to test server";
            }
            catch (Exception ex)
            {
                _status.Text = "NAVDECK Desktop | Browser unavailable";
                MessageBox.Show(
                    "Unable to initialise NAVDECK Desktop:\n\n" + ex.Message,
                    "NAVDECK Desktop",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        };
    }
}
