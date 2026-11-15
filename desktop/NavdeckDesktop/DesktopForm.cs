using Microsoft.Web.WebView2.WinForms;

namespace NavdeckLink;

internal sealed class DesktopForm : Form
{
    private readonly WebView2 _browser = new();
    private MainForm? _bridge;

    private readonly Label _simStatus = new()
    {
        Text = "● Simulator disconnected",
        AutoSize = true,
        ForeColor = Color.FromArgb(245, 158, 158),
        BackColor = Color.Transparent,
        Font = new Font("Segoe UI", 9, FontStyle.Bold)
    };

    private readonly System.Windows.Forms.Timer _statusTimer = new()
    {
        Interval = 1000
    };


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
            if (_bridge is null || _bridge.IsDisposed)
                return;

            _bridge.Show();
            _bridge.WindowState = FormWindowState.Normal;
            _bridge.BringToFront();
            _bridge.Activate();
        };

        toolbar.Controls.Add(bridgeButton);

        _simStatus.Location = new Point(230, 16);
        toolbar.Controls.Add(_simStatus);

        _statusTimer.Tick += (_, _) =>
        {
            if (_bridge is null || _bridge.IsDisposed)
                return;

            if (_bridge.SimulatorConnected)
            {
                _simStatus.Text =
                    "● MSFS Connected | " + _bridge.SimulatorAircraft;

                _simStatus.ForeColor =
                    Color.FromArgb(74, 222, 128);
            }
            else
            {
                _simStatus.Text = "● Simulator disconnected";
                _simStatus.ForeColor =
                    Color.FromArgb(245, 158, 158);
            }
        };

        FormClosed += (_, _) => _statusTimer.Stop();

        _browser.Dock = DockStyle.Fill;
        Controls.Add(_browser);
        Controls.Add(toolbar);

        Shown += async (_, _) =>
        {
            _bridge = new MainForm(false);
            _bridge.ShowInTaskbar = false;
            _bridge.Opacity = 0;
            _bridge.Show(this);
            _bridge.Hide();
            _bridge.Opacity = 1;
            _statusTimer.Start();

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
