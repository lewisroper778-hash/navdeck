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


        // Desktop navigation: independent of the website's existing navbar.
        var sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 220,
            BackColor = Color.FromArgb(25, 26, 31),
            Padding = new Padding(12)
        };

        var navigation = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true
        };

        sidebar.Controls.Add(navigation);

        var logo = new Label
        {
            Text = "✈  NAVDECK",
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 17, FontStyle.Bold),
            Width = 190,
            Height = 65,
            TextAlign = ContentAlignment.MiddleLeft
        };
        navigation.Controls.Add(logo);

        void AddNavigation(string title, string route)
        {
            var button = new Button
            {
                Text = title,
                Width = 185,
                Height = 44,
                TextAlign = ContentAlignment.MiddleLeft,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(35, 36, 43),
                ForeColor = Color.FromArgb(220, 222, 230),
                Font = new Font("Segoe UI", 10),
                Margin = new Padding(0, 3, 0, 3),
                Cursor = Cursors.Hand
            };

            button.FlatAppearance.BorderSize = 0;
            button.FlatAppearance.MouseOverBackColor =
                Color.FromArgb(66, 46, 112);

            button.Click += (_, _) =>
            {
                if (_browser.CoreWebView2 is not null)
                    _browser.CoreWebView2.Navigate(
                        "https://test.navdeck.online" + route
                    );
            };

            navigation.Controls.Add(button);
        }

        AddNavigation("Dashboard", "/");
        AddNavigation("My Flights", "/flights");
        AddNavigation("SimBrief", "/settings");
        AddNavigation("VATSIM", "/vatsim");
        AddNavigation("Community", "/community");
        AddNavigation("Logbook", "/logbook");

        var connectionButton = new Button
        {
            Text = "Simulator Connection",
            Width = 185,
            Height = 44,
            TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(66, 46, 112),
            ForeColor = Color.White,
            Margin = new Padding(0, 16, 0, 3),
            Cursor = Cursors.Hand
        };

        connectionButton.FlatAppearance.BorderSize = 0;
        connectionButton.Click += (_, _) =>
        {
            if (_bridge is null || _bridge.IsDisposed)
                return;

            _bridge.Show();
            _bridge.WindowState = FormWindowState.Normal;
            _bridge.BringToFront();
            _bridge.Activate();
        };

        navigation.Controls.Add(connectionButton);

        _browser.Dock = DockStyle.Fill;
        Controls.Add(_browser);
        Controls.Add(sidebar);
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
                // Apply desktop-only styling to NAVDECK pages.
                _browser.CoreWebView2.NavigationCompleted +=
                    async (_, args) =>
                {
                    if (!args.IsSuccess)
                        return;

                    var uri = _browser.CoreWebView2.Source;
                    if (!Uri.TryCreate(uri, UriKind.Absolute, out var page))
                        return;

                    if (page.Scheme != Uri.UriSchemeHttps ||
                        page.Host != "test.navdeck.online")
                        return;

                    const string desktopCss = """
                        .navdeck-sidebar,
                        .navdeck-topbar {
                            display: none !important;
                        }

                        body {
                            margin: 0 !important;
                            background: #111318 !important;
                        }

                        /* Desktop workspace fills the application. */
                        main {
                            margin-left: 0 !important;
                            padding-top: 24px !important;
                            max-width: none !important;
                            width: 100% !important;
                            box-sizing: border-box !important;
                        }

                        /* Remove website navigation spacing. */
                        .navdeck-sidebar + main,
                        .navdeck-topbar + main {
                            margin-left: 0 !important;
                        }

                        /* Keep flight panels within the workspace. */
                        main > * {
                            min-width: 0;
                        }
                        """;

                    var script = """
                        (() => {
                            let style = document.getElementById(
                                'navdeck-desktop-style'
                            );

                            if (!style) {
                                style = document.createElement('style');
                                style.id = 'navdeck-desktop-style';
                                document.head.appendChild(style);
                            }

                            style.textContent = CSS_TEXT;
                        })();
                        """;

                    try
                    {
                        await _browser.CoreWebView2.ExecuteScriptAsync(
                            script.Replace(
                                "CSS_TEXT",
                                System.Text.Json.JsonSerializer.Serialize(desktopCss)
                            )
                        );
                    }
                    catch (Exception)
                    {
                        // Navigation can change before injection completes.
                    }
                };

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
