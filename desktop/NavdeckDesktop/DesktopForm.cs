using Microsoft.Web.WebView2.WinForms;

namespace NavdeckLink;

internal sealed class DesktopForm : Form
{
    private readonly WebView2 _browser = new();
    private MainForm? _bridge;
    private NavdeckApi? _cloudApi;
    private string? _cloudCode;

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
        MinimumSize = new Size(1024, 650);
        BackColor = Color.FromArgb(23, 23, 26);

        // Native navigation remains visible when switching to the existing
        // NAVDECK website routes. The dashboard is an embedded, app-native map.
        var sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 238,
            BackColor = Color.FromArgb(29, 29, 32),
            Padding = new Padding(12, 0, 12, 0)
        };

        var navigation = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = Color.FromArgb(29, 29, 32),
            Padding = new Padding(0, 6, 0, 6)
        };
        navigation.SizeChanged += (_, _) =>
        {
            foreach (Control item in navigation.Controls)
                item.Width = Math.Max(170, navigation.ClientSize.Width - 14);
        };

        var brand = new Panel
        {
            Dock = DockStyle.Top,
            Height = 142,
            BackColor = Color.FromArgb(29, 29, 32)
        };

        var brandIcon = new Label
        {
            Text = "↗",
            AutoSize = false,
            Size = new Size(34, 34),
            Location = new Point(7, 20),
            TextAlign = ContentAlignment.MiddleCenter,
            BackColor = Color.FromArgb(131, 59, 240),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Symbol", 19, FontStyle.Bold)
        };

        var brandTitle = new Label
        {
            Text = "NAVDECK",
            AutoSize = false,
            Size = new Size(155, 38),
            Location = new Point(47, 18),
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.FromArgb(250, 249, 253),
            Font = new Font("Segoe UI", 17, FontStyle.Bold)
        };

        var brandSubtitle = new Label
        {
            Text = "FLIGHT OPERATIONS",
            AutoSize = false,
            Location = new Point(8, 65),
            Size = new Size(208, 24),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(151, 148, 159),
            TextAlign = ContentAlignment.MiddleLeft
        };

        var brandLine = new Panel
        {
            BackColor = Color.FromArgb(66, 65, 72),
            Location = new Point(5, 109),
            Size = new Size(208, 1)
        };
        brand.Controls.Add(brandIcon);
        brand.Controls.Add(brandTitle);
        brand.Controls.Add(brandSubtitle);
        brand.Controls.Add(brandLine);

        Button? activeNavigation = null;

        void AddSection(string title)
        {
            navigation.Controls.Add(new Label
            {
                Text = title,
                Height = 29,
                Width = 205,
                TextAlign = ContentAlignment.BottomLeft,
                Padding = new Padding(11, 0, 0, 4),
                ForeColor = Color.FromArgb(137, 133, 146),
                Font = new Font("Segoe UI", 8, FontStyle.Bold),
                Margin = new Padding(0, 4, 0, 7)
            });
        }

        void AddNavigation(string title, string glyph, string route)
        {
            bool isDashboard = title == "Dashboard";
            var button = new Button
            {
                Text = "   " + glyph + "     " + title,
                Height = 44,
                Width = 205,
                TextAlign = ContentAlignment.MiddleLeft,
                FlatStyle = FlatStyle.Flat,
                BackColor = isDashboard
                    ? Color.FromArgb(117, 54, 228)
                    : Color.FromArgb(29, 29, 32),
                ForeColor = isDashboard
                    ? Color.White
                    : Color.FromArgb(191, 188, 198),
                Font = new Font("Segoe UI", 10, isDashboard
                    ? FontStyle.Bold : FontStyle.Regular),
                Cursor = Cursors.Hand,
                Margin = new Padding(0, 2, 0, 2),
                TabStop = true
            };
            button.FlatAppearance.BorderSize = 0;
            button.FlatAppearance.MouseOverBackColor = Color.FromArgb(69, 56, 91);

            if (isDashboard)
                activeNavigation = button;

            button.Click += (_, _) =>
            {
                if (_browser.CoreWebView2 is null)
                    return;

                // Only locally packaged pages may render inside this app.
                _browser.CoreWebView2.Navigate(
                    "https://navdeck-desktop.local/" + route);

                if (activeNavigation is not null)
                {
                    activeNavigation.BackColor = Color.FromArgb(29, 29, 32);
                    activeNavigation.ForeColor = Color.FromArgb(191, 188, 198);
                    activeNavigation.Font = new Font("Segoe UI", 10);
                }
                button.BackColor = Color.FromArgb(117, 54, 228);
                button.ForeColor = Color.White;
                button.Font = new Font("Segoe UI", 10, FontStyle.Bold);
                activeNavigation = button;
            };

            navigation.Controls.Add(button);
        }

        AddSection("WORKSPACE");
        AddNavigation("Dashboard", "◈", "map.html");
        AddNavigation("My Flights", "✈", "workspace.html#flights");
        AddNavigation("SimBrief", "≋", "workspace.html#simbrief");
        AddNavigation("VATSIM", "◎", "workspace.html#vatsim");
        AddSection("COMMUNITY");
        AddNavigation("Community", "▦", "workspace.html#community");
        AddNavigation("Logbook", "▤", "workspace.html#logbook");

        AddSection("APPLICATION");
        AddNavigation("Settings", "⚙", "workspace.html#settings");

        var footer = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 152,
            BackColor = Color.FromArgb(29, 29, 32),
            Padding = new Padding(4, 12, 4, 8)
        };

        var footerDivider = new Panel
        {
            Dock = DockStyle.Top,
            Height = 1,
            BackColor = Color.FromArgb(66, 65, 72)
        };

        _simStatus.AutoSize = false;
        _simStatus.TextAlign = ContentAlignment.MiddleLeft;
        _simStatus.Dock = DockStyle.Top;
        _simStatus.Height = 51;
        _simStatus.Font = new Font("Segoe UI", 9, FontStyle.Bold);

        var bridgeButton = new Button
        {
            Text = "   ◉   Simulator Connection",
            Dock = DockStyle.Top,
            Height = 45,
            TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(49, 43, 63),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9),
            Cursor = Cursors.Hand
        };
        bridgeButton.FlatAppearance.BorderSize = 0;
        bridgeButton.FlatAppearance.MouseOverBackColor =
            Color.FromArgb(83, 54, 124);
        bridgeButton.Click += (_, _) =>
        {
            if (_bridge is null || _bridge.IsDisposed)
                return;
            _bridge.Show();
            _bridge.WindowState = FormWindowState.Normal;
            _bridge.BringToFront();
            _bridge.Activate();
        };

        footer.Controls.Add(bridgeButton);
        footer.Controls.Add(_simStatus);
        footer.Controls.Add(footerDivider);

        _statusTimer.Tick += (_, _) =>
        {
            if (_bridge is null || _bridge.IsDisposed)
                return;

            if (_bridge.SimulatorConnected)
            {
                _simStatus.Text = "●  Simulator connected\n    " +
                    _bridge.SimulatorAircraft;
                _simStatus.ForeColor = Color.FromArgb(116, 219, 160);
            }
            else
            {
                _simStatus.Text = "●  Simulator disconnected";
                _simStatus.ForeColor = Color.FromArgb(232, 142, 142);
            }
        };

        FormClosed += (_, _) => _statusTimer.Stop();

        sidebar.Controls.Add(navigation);
        sidebar.Controls.Add(footer);
        sidebar.Controls.Add(brand);
        _browser.Dock = DockStyle.Fill;
        Controls.Add(_browser);
        Controls.Add(sidebar);

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
                // Only the packaged desktop map may request simulator telemetry.
                const string mapOrigin = "https://navdeck-desktop.local";
                var mapFolder = Path.Combine(AppContext.BaseDirectory, "desktop-map");
                _browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "navdeck-desktop.local", mapFolder,
                    Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.DenyCors);

                // Prevent remote NAVDECK website pages (or any external site)
                // from becoming navigation destinations inside the app window.
                _browser.CoreWebView2.NavigationStarting += (_, nav) =>
                {
                    if (!Uri.TryCreate(nav.Uri, UriKind.Absolute, out var page) ||
                        page.GetLeftPart(UriPartial.Authority) != mapOrigin)
                        nav.Cancel = true;
                };

                // Local HTML is only the user interface. Every cloud operation
                // goes through this narrowly scoped native pairing-token bridge.
                await _browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    """
                    (() => {
                      if (location.origin !== 'https://navdeck-desktop.local') return;
                      let nextId = 0;
                      const pending = new Map();
                      const request = (action, payload) => new Promise((resolve, reject) => {
                        const id = ++nextId;
                        const timeout = setTimeout(() => {
                          pending.delete(id);
                          reject(new Error('The desktop request timed out'));
                        }, 45000);
                        pending.set(id, {resolve, reject, timeout});
                        window.chrome.webview.postMessage({type:'navdeck:request', action, id, payload});
                      });
                      window.navdeckDesktop = Object.freeze({
                        getTelemetry: () => request('getTelemetry').catch(() => null),
                        getFlight: () => request('getFlight'),
                        getFlights: () => request('getFlights'),
                        getLogbook: () => request('getLogbook'),
                        getProfile: () => request('getProfile'),
                        saveProfile: (payload) => request('saveProfile', payload),
                        importSimbrief: () => request('importSimbrief')
                      });
                      window.chrome.webview.addEventListener('message', event => {
                        if (event.data?.type !== 'navdeck:result') return;
                        const job = pending.get(event.data.id);
                        if (!job) return;
                        pending.delete(event.data.id);
                        clearTimeout(job.timeout);
                        if (event.data.error) job.reject(new Error(event.data.error));
                        else job.resolve(event.data.data ?? null);
                      });
                    })();
                    """);

                _browser.CoreWebView2.WebMessageReceived += async (_, args) =>
                {
                    // Reject any request from outside our packaged application.
                    if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var sender) ||
                        sender.GetLeftPart(UriPartial.Authority) != mapOrigin)
                        return;

                    int requestId = 0;
                    try
                    {
                        using var message = System.Text.Json.JsonDocument.Parse(
                            args.WebMessageAsJson);
                        var root = message.RootElement;
                        if (!root.TryGetProperty("type", out var kind) ||
                            kind.GetString() != "navdeck:request" ||
                            !root.TryGetProperty("id", out var id) ||
                            !id.TryGetInt32(out requestId) ||
                            !root.TryGetProperty("action", out var act) ||
                            act.ValueKind != System.Text.Json.JsonValueKind.String)
                            return;

                        var action = act.GetString() ?? "";
                        object? data;

                        if (action == "getTelemetry")
                        {
                            var sample = _bridge?.LiveAircraftSample;
                            data = sample is { } t
                                ? new
                                {
                                    lat = t.Lat,
                                    lon = t.Lon,
                                    altitude_ft = t.AltFt,
                                    groundspeed_kt = t.GroundSpeedKt,
                                    heading_deg = t.HeadingDeg,
                                    fuel_lb = t.FuelLb,
                                    aircraft = _bridge?.SimulatorAircraft
                                }
                                : null;
                        }
                        else
                        {
                            var config = Config.Load();
                            if (!Config.IsValidCode(config.Code))
                                throw new InvalidOperationException(
                                    "No valid connection code. Open Simulator Connection to pair.");

                            if (_cloudApi is null || _cloudCode != config.Code)
                            {
                                _cloudApi = new NavdeckApi(config.Code);
                                _cloudCode = config.Code;
                            }

                            System.Text.Json.JsonElement? payload =
                                root.TryGetProperty("payload", out var p)
                                    ? p.Clone() : null;
                            data = await _cloudApi.RequestDesktopAsync(action, payload);
                        }

                        if (!IsDisposed && _browser.CoreWebView2 is not null)
                            _browser.CoreWebView2.PostWebMessageAsJson(
                                System.Text.Json.JsonSerializer.Serialize(
                                    new { type = "navdeck:result", id = requestId,
                                          data, error = (string?)null }));
                    }
                    catch (Exception ex)
                    {
                        if (requestId != 0 && !IsDisposed &&
                            _browser.CoreWebView2 is not null)
                        {
                            _browser.CoreWebView2.PostWebMessageAsJson(
                                System.Text.Json.JsonSerializer.Serialize(
                                    new { type = "navdeck:result", id = requestId,
                                          data = (object?)null, error = ex.Message }));
                        }
                    }
                };

                _browser.CoreWebView2.Navigate(
                    "https://navdeck-desktop.local/map.html"
                );
                _status.Text = "NAVDECK Desktop | Live map";
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
