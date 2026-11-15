using Microsoft.Web.WebView2.WinForms;

namespace NavdeckLink;

internal sealed class DesktopForm : Form
{
    private readonly WebView2 _browser = new();
    private MainForm? _bridge;
    private readonly Dictionary<string, Button> _navButtons = new();
    private bool _authenticated;
    private bool _signingOut;
    private readonly CheckBox _staySignedIn = new()
    {
        Text = "Stay signed in on this computer",
        Checked = true,
        AutoSize = true,
        ForeColor = Color.FromArgb(190, 207, 229),
        BackColor = Color.Transparent,
        Font = new Font("Segoe UI", 10f)
    };

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

    private void SelectNavigation(string selected)
    {
        _status.Text = selected.TrimStart('◈', '✈', '▤', '◎', '⌂', '▣', ' ') +
            "  /  NAVDECK Desktop";
        foreach (var item in _navButtons)
        {
            bool active = item.Key == selected;
            item.Value.BackColor = active
                ? Color.FromArgb(28, 56, 91) : Color.FromArgb(13, 19, 30);
            item.Value.ForeColor = active
                ? Color.FromArgb(110, 212, 255) : Color.FromArgb(172, 190, 215);
        }
    }

    private void StartSimulatorBridge()
    {
        try
        {
            _bridge = new MainForm(false)
            {
                ShowInTaskbar = false,
                Opacity = 0
            };
            _bridge.Show(this);
            _bridge.Hide();
            _bridge.Opacity = 1;
            _statusTimer.Start();
        }
        catch (Exception ex)
        {
            _simStatus.Text = "Simulator connection unavailable";
            _simStatus.ForeColor = Color.FromArgb(245, 158, 158);
            MessageBox.Show(
                "The simulator connection could not start. You can still use NAVDECK.\n\n" +
                ex.Message, "NAVDECK Desktop", MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    public DesktopForm()
    {
        Text = "NAVDECK Desktop";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(1100, 720);
        Font = new Font("Segoe UI", 10f);
        BackColor = Color.FromArgb(12, 17, 27);

        var toolbar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 70,
            BackColor = Color.FromArgb(16, 23, 36)
        };

        _status.Location = new Point(22, 22);
        _status.Font = new Font("Segoe UI Semibold", 13f, FontStyle.Bold);
        toolbar.Controls.Add(_status);

        var bridgeButton = new Button
        {
            Text = "⚙  SIMULATOR",
            Dock = DockStyle.Right,
            Width = 185,
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

        _simStatus.Location = new Point(375, 26);
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

        FormClosed += (_, _) =>
        {
            _statusTimer.Stop();
            if (!_staySignedIn.Checked && _browser.CoreWebView2 is not null)
            {
                try { _browser.CoreWebView2.CookieManager.DeleteAllCookies(); }
                catch (Exception) { /* Browser may already be disposed. */ }
            }
            if (_bridge is { IsDisposed: false })
                _bridge.Close();
        };


        // Desktop navigation: independent of the website's existing navbar.
        var sidebar = new Panel
        {
            Dock = DockStyle.Left,
            Width = 248,
            BackColor = Color.FromArgb(13, 19, 30),
            Padding = new Padding(18, 18, 12, 12)
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
            Font = new Font("Segoe UI Semibold", 20, FontStyle.Bold),
            Width = 210,
            Height = 72,
            TextAlign = ContentAlignment.MiddleLeft
        };
        navigation.Controls.Add(logo);
        navigation.Controls.Add(new Label
        {
            Text = "FLIGHT OPERATIONS",
            ForeColor = Color.FromArgb(105, 129, 159),
            Font = new Font("Segoe UI", 8, FontStyle.Bold),
            Width = 208, Height = 38,
            Padding = new Padding(10, 14, 0, 0)
        });

        void AddNavigation(string title, string route)
        {
            var button = new Button
            {
                Text = title,
                Width = 208,
                Height = 48,
                TextAlign = ContentAlignment.MiddleLeft,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(13, 19, 30),
                ForeColor = Color.FromArgb(172, 190, 215),
                Font = new Font("Segoe UI Semibold", 10),
                Margin = new Padding(0, 3, 0, 3),
                Cursor = Cursors.Hand
            };

            button.FlatAppearance.BorderSize = 0;
            button.FlatAppearance.MouseOverBackColor =
                Color.FromArgb(36, 51, 78);

            _navButtons[title] = button;
            button.Click += (_, _) =>
            {
                if (!_authenticated) return;
                SelectNavigation(title);
                if (_browser.CoreWebView2 is not null)
                    _browser.CoreWebView2.Navigate(
                        route.StartsWith("https://", StringComparison.Ordinal)
                            ? route : "https://test.navdeck.online" + route
                    );
            };

            navigation.Controls.Add(button);
        }

        AddNavigation("◈   Overview", "https://navdeck-desktop.local/map.html");
        AddNavigation("✈   My Flights", "/flights");
        AddNavigation("▤   SimBrief", "/settings");
        AddNavigation("◎   VATSIM", "/vatsim");
        AddNavigation("⌂   NAVDECK Home", "/");
        AddNavigation("▣   Logbook", "/logbook");
        SelectNavigation("◈   Overview");

        var connectionButton = new Button
        {
            Text = "⚙   Simulator Connection",
            Width = 208,
            Height = 48,
            TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(30, 54, 83),
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

        navigation.Controls.Add(new Label
        {
            Text = "SYSTEM",
            ForeColor = Color.FromArgb(105, 129, 159),
            Font = new Font("Segoe UI", 8, FontStyle.Bold),
            Width = 208, Height = 45,
            Padding = new Padding(10, 20, 0, 0)
        });
        navigation.Controls.Add(connectionButton);

        _browser.Dock = DockStyle.Fill;
        Controls.Add(_browser);
        Controls.Add(sidebar);
        Controls.Add(toolbar);
        toolbar.Visible = false;
        sidebar.Visible = false;
        var loginHeader = new Panel
        {
            Dock = DockStyle.Top,
            Height = 64,
            BackColor = Color.FromArgb(13, 19, 30)
        };
        loginHeader.Controls.Add(new Label
        {
            Text = "✈  NAVDECK  /  SECURE SIGN IN",
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 13f, FontStyle.Bold),
            Location = new Point(24, 20),
            AutoSize = true
        });
        Controls.Add(loginHeader);

        // NAVDECK credentials are entered only into the trusted Clerk website.
        // The desktop shell remains locked until Clerk reports an active session.
        var preferenceFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NAVDECK", "Desktop", "stay-signed-in.txt");
        try
        {
            _staySignedIn.Checked = !File.Exists(preferenceFile) ||
                File.ReadAllText(preferenceFile).Trim() == "true";
        }
        catch (IOException) { _staySignedIn.Checked = false; }
        catch (UnauthorizedAccessException) { _staySignedIn.Checked = false; }
        _staySignedIn.CheckedChanged += (_, _) =>
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(preferenceFile)!);
                File.WriteAllText(preferenceFile,
                    _staySignedIn.Checked ? "true" : "false");
            }
            catch (IOException) { /* Do not block sign-in for a preference write. */ }
            catch (UnauthorizedAccessException) { }
        };
        // The trusted Clerk login page is the entire workspace until
        // an authenticated Clerk session is confirmed.
        _staySignedIn.Dock = DockStyle.Right;
        _staySignedIn.Padding = new Padding(12, 0, 22, 0);
        loginHeader.Controls.Add(_staySignedIn);
        var signOutButton = new Button
        {
            Text = "↪   Sign out",
            Width = 208, Height = 46,
            TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(24, 34, 51),
            ForeColor = Color.FromArgb(181, 197, 217),
            Cursor = Cursors.Hand,
            Visible = false
        };
        signOutButton.FlatAppearance.BorderSize = 0;
        signOutButton.Click += async (_, _) =>
        {
            if (_browser.CoreWebView2 is null || _signingOut) return;
            _signingOut = true;
            _authenticated = false;
            toolbar.Visible = false;
            sidebar.Visible = false;
            loginHeader.Visible = true;
            foreach (var button in _navButtons.Values) button.Enabled = false;
            signOutButton.Visible = false;
            _staySignedIn.Visible = true;
            _statusTimer.Stop();
            if (_bridge is { IsDisposed: false }) _bridge.Close();
            _bridge = null;
            try
            {
                // Revoke the Clerk session when already on the NAVDECK website.
                if (Uri.TryCreate(_browser.CoreWebView2.Source,
                        UriKind.Absolute, out var current) &&
                    current.Host == "test.navdeck.online")
                {
                    await _browser.CoreWebView2.ExecuteScriptAsync(
                        "window.Clerk?.signOut?.()");
                }
                // Cookies alone are not enough: Clerk can persist session data
                // in local storage and IndexedDB.
                await _browser.CoreWebView2.Profile.ClearBrowsingDataAsync();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Some session data could not be cleared. Close NAVDECK Desktop " +
                    "before using this computer with another account.\n\n" +
                    ex.Message, "NAVDECK Desktop", MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
            _browser.CoreWebView2.Navigate("https://test.navdeck.online/sign-in");
            _status.Text = "Sign in  /  NAVDECK Desktop";
            _signingOut = false;
        };
        navigation.Controls.Add(signOutButton);
        foreach (var button in _navButtons.Values) button.Enabled = false;

        Shown += async (_, _) =>
        {
            try
            {
                // Separate ephemeral and persistent browser profiles so users
                // who opt out do not retain Clerk session tokens or web storage.
                var profile = _staySignedIn.Checked
                    ? Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "NAVDECK", "Desktop", "WebView2")
                    : Path.Combine(Path.GetTempPath(), "NAVDECK", "Desktop",
                        "Session-" + Environment.ProcessId);
                Directory.CreateDirectory(profile);
                var environment = await Microsoft.Web.WebView2.Core.CoreWebView2Environment
                    .CreateAsync(userDataFolder: profile);
                await _browser.EnsureCoreWebView2Async(environment);
                _browser.CoreWebView2.Settings.AreDevToolsEnabled = false;

                // The signed-in signal must originate from the trusted NAVDECK site.
                _browser.CoreWebView2.WebMessageReceived += (_, args) =>
                {
                    if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) ||
                        source.Scheme != Uri.UriSchemeHttps ||
                        source.Host != "test.navdeck.online")
                        return;
                    try
                    {
                        using var document = System.Text.Json.JsonDocument.Parse(args.WebMessageAsJson);
                        if (!document.RootElement.TryGetProperty("type", out var type) ||
                            type.GetString() != "navdeck:auth") return;
                        if (!document.RootElement.TryGetProperty("signedIn", out var signedIn) ||
                            signedIn.ValueKind != System.Text.Json.JsonValueKind.True) return;
                        if (_authenticated || _signingOut) return;
                        _authenticated = true;
                        loginHeader.Visible = false;
                        toolbar.Visible = true;
                        sidebar.Visible = true;
                        signOutButton.Visible = true;
                        if (_bridge is null || _bridge.IsDisposed)
                            StartSimulatorBridge();
                        foreach (var button in _navButtons.Values) button.Enabled = true;
                        _browser.CoreWebView2.Navigate("https://navdeck-desktop.local/map.html");
                        SelectNavigation("◈   Overview");
                    }
                    catch (System.Text.Json.JsonException) { }
                };
                await _browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    """
                    (() => {
                      if (location.origin !== 'https://test.navdeck.online') return;
                      // Continue monitoring while the user completes sign-in,
                      // including slow sign-in, MFA and password recovery flows.
                      const timer = setInterval(() => {
                        if (window.Clerk?.user && window.Clerk?.session) {
                          clearInterval(timer);
                          window.chrome.webview.postMessage({type:'navdeck:auth',signedIn:true});
                        }
                      }, 1000);
                    })();
                    """);

                // Prevent unauthenticated navigation to local app content.
                _browser.CoreWebView2.NavigationStarting += (_, navigation) =>
                {
                    if (_authenticated) return;
                    if (Uri.TryCreate(navigation.Uri, UriKind.Absolute, out var destination) &&
                        destination.Host == "navdeck-desktop.local")
                        navigation.Cancel = true;
                };

                // Only the packaged desktop map may request simulator telemetry.
                const string mapOrigin = "https://navdeck-desktop.local";
                var mapFolder = Path.Combine(AppContext.BaseDirectory, "desktop-map");
                _browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "navdeck-desktop.local", mapFolder,
                    Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.DenyCors);

                await _browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
                    """
                    (() => {
                      if (location.origin !== 'https://navdeck-desktop.local') return;
                      let nextId = 0;
                      const pending = new Map();
                      window.navdeckDesktop = {
                        getTelemetry() {
                          return new Promise(resolve => {
                            const id = ++nextId;
                            const timeout = setTimeout(() => {
                              pending.delete(id);
                              resolve(null);
                            }, 3000);
                            pending.set(id, value => {
                              clearTimeout(timeout);
                              resolve(value);
                            });
                            window.chrome.webview.postMessage({type:'navdeck:getTelemetry',id});
                          });
                        }
                      };
                      window.chrome.webview.addEventListener('message', event => {
                        if (event.data?.type !== 'navdeck:telemetry') return;
                        const resolve = pending.get(event.data.id);
                        if (resolve) {
                          pending.delete(event.data.id);
                          resolve(event.data.telemetry ?? null);
                        }
                      });
                    })();
                    """);

                _browser.CoreWebView2.WebMessageReceived += (_, args) =>
                {
                    // Web messages from login providers or remote pages are untrusted.
                    if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var sender) ||
                        sender.GetLeftPart(UriPartial.Authority) != mapOrigin)
                        return;
                    try
                    {
                        using var message = System.Text.Json.JsonDocument.Parse(args.WebMessageAsJson);
                        var root = message.RootElement;
                        if (!root.TryGetProperty("type", out var type) ||
                            type.GetString() != "navdeck:getTelemetry" ||
                            !root.TryGetProperty("id", out var id) ||
                            !id.TryGetInt32(out int requestId))
                            return;

                        var sample = _authenticated ? _bridge?.LiveAircraftSample : null;
                        var telemetry = new
                        {
                            lat = sample?.Lat,
                            lon = sample?.Lon,
                            altitude_ft = sample?.AltFt,
                            groundspeed_kt = sample?.GroundSpeedKt,
                            heading_deg = sample?.HeadingDeg,
                            fuel_lb = sample?.FuelLb,
                            aircraft = _bridge?.SimulatorAircraft,
                            flight = _bridge?.LiveFlightCallsign,
                            route = _bridge?.LiveFlightRoute,
                            stage = _bridge?.LiveFlightStage,
                            waypoints = _bridge?.LiveWaypointSummary,
                            sim_connected = _bridge?.SimulatorConnected == true,
                            navdeck_connected = _bridge?.NavdeckConnected == true
                        };

                        _browser.CoreWebView2.PostWebMessageAsJson(
                            System.Text.Json.JsonSerializer.Serialize(
                                new { type = "navdeck:telemetry", id = requestId, telemetry }));
                    }
                    catch (Exception)
                    {
                        // Ignore malformed or unrelated web messages.
                    }
                };

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
                        .navdeck-topbar,
                        header:has([data-testid="nav-logo"]) {
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
                            document.documentElement.classList.add('dark');
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

                _browser.CoreWebView2.SourceChanged += (_, _) =>
                {
                    if (!_authenticated ||
                        !Uri.TryCreate(_browser.CoreWebView2.Source,
                            UriKind.Absolute, out var uri)) return;

                    if (uri.Host == "navdeck-desktop.local")
                    {
                        SelectNavigation("◈   Overview");
                        return;
                    }
                    if (uri.Host != "test.navdeck.online") return;
                    var current = uri.AbsolutePath;
                    SelectNavigation(
                        current.StartsWith("/flights", StringComparison.OrdinalIgnoreCase)
                            ? "✈   My Flights"
                        : current.StartsWith("/settings", StringComparison.OrdinalIgnoreCase)
                            ? "▤   SimBrief"
                        : current.StartsWith("/vatsim", StringComparison.OrdinalIgnoreCase)
                            ? "◎   VATSIM"
                        : current.StartsWith("/logbook", StringComparison.OrdinalIgnoreCase)
                            ? "▣   Logbook"
                        : "⌂   NAVDECK Home");
                };

                _browser.CoreWebView2.Navigate(
                    "https://test.navdeck.online/sign-in"
                );
                _status.Text = "Sign in  /  NAVDECK Desktop";
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
