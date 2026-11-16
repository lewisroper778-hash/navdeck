using Microsoft.Web.WebView2.WinForms;

namespace NavdeckLink;

internal sealed class DesktopForm : Form
{
    private readonly WebView2 _browser = new();
    private MainForm? _bridge;
    private NavdeckApi? _cloudApi;
    private string? _cloudCode;
    private bool _clerkDialogOpen;

    private bool SignInWithClerk()
    {
        if (_clerkDialogOpen) return false;
        if (_bridge?.HasPendingGoArounds == true)
            throw new InvalidOperationException(
                "A go-around is still syncing. Wait until it is saved before changing accounts.");
        _clerkDialogOpen = true;
        try
        {
            using var login = new ClerkLoginDialog();
            if (login.ShowDialog(this) != DialogResult.OK ||
                string.IsNullOrWhiteSpace(login.DesktopToken))
                return false;
            // The backend has already validated the Clerk JWT and issued
            // this revocable desktop credential. No manual code is required.
            var code = "https://navdeck-backend.onrender.com#" + login.DesktopToken;
            if (_bridge is { IsDisposed: false })
                _bridge.ApplyClerkConnection(code);
            else
            {
                var saved = Config.Load();
                var previousCode = saved.Code;
                saved.Code = code;
                saved.SignedInWithClerk = true;
                saved.Save();
                DesktopProfileCache.Clear(previousCode);
            }
            _cloudApi = null;
            _cloudCode = null;
            return true;
        }
        finally { _clerkDialogOpen = false; }
    }

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
            Width = 278,
            BackColor = Color.FromArgb(22, 24, 31),
            Padding = new Padding(13, 0, 13, 0)
        };

        var navigation = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoScroll = true,
            BackColor = Color.FromArgb(22, 24, 31),
            Padding = new Padding(0, 6, 0, 8)
        };
        // Take the true client width, including scrollbar/DPI changes, so
        // the navigation text is never pushed beneath a scrollbar.
        void FitNavigation()
        {
            var width = Math.Max(190, navigation.ClientSize.Width - 9);
            foreach (Control item in navigation.Controls)
                item.Width = width;
        }
        navigation.SizeChanged += (_, _) => FitNavigation();

        // Use the exact NAVDECK website favicon, not a separately drawn logo.
        // Table layout keeps the mark and wordmark inside the sidebar at any DPI.
        var brand = new Panel
        {
            Dock = DockStyle.Top,
            Height = 105,
            BackColor = Color.FromArgb(22, 24, 31),
            Padding = new Padding(8, 17, 8, 13)
        };
        var brandLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        brandLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 58));
        brandLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        brandLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var brandIcon = new PictureBox
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 0, 8, 0),
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent
        };
        var websiteLogoPath = Path.Combine(AppContext.BaseDirectory,
            "desktop-map", "navdeck-website-logo.png");
        if (File.Exists(websiteLogoPath))
        {
            using var stream = File.OpenRead(websiteLogoPath);
            using var logo = Image.FromStream(stream);
            brandIcon.Image = new Bitmap(logo);
        }

        var brandText = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        brandText.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        brandText.RowStyles.Add(new RowStyle(SizeType.Percent, 58));
        brandText.RowStyles.Add(new RowStyle(SizeType.Percent, 42));
        var brandTitle = new Label
        {
            Text = "NAVDECK",
            Dock = DockStyle.Fill,
            AutoSize = false,
            AutoEllipsis = false,
            Margin = Padding.Empty,
            TextAlign = ContentAlignment.BottomLeft,
            ForeColor = Color.FromArgb(248, 249, 254),
            Font = new Font("Segoe UI Semibold", 14.5f, FontStyle.Bold)
        };
        var brandSubtitle = new Label
        {
            Text = "FLIGHT SIM EFB",
            Dock = DockStyle.Fill,
            AutoSize = false,
            AutoEllipsis = false,
            Margin = Padding.Empty,
            TextAlign = ContentAlignment.TopLeft,
            ForeColor = Color.FromArgb(164, 171, 192),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Regular)
        };
        brandText.Controls.Add(brandTitle, 0, 0);
        brandText.Controls.Add(brandSubtitle, 0, 1);
        brandLayout.Controls.Add(brandIcon, 0, 0);
        brandLayout.Controls.Add(brandText, 1, 0);
        var brandLine = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 1,
            BackColor = Color.FromArgb(54, 57, 73)
        };
        brand.Controls.Add(brandLayout);
        brand.Controls.Add(brandLine);

        Button? activeNavigation = null;

        void AddSection(string title)
        {
            navigation.Controls.Add(new Label
            {
                Text = title,
                Height = 29,
                Width = 240,
                TextAlign = ContentAlignment.BottomLeft,
                Padding = new Padding(13, 0, 0, 5),
                ForeColor = Color.FromArgb(124, 129, 148),
                Font = new Font("Segoe UI", 8, FontStyle.Bold),
                Margin = new Padding(0, 8, 0, 6)
            });
        }

        var navigationFont = new Font("Segoe UI", 9.5f, FontStyle.Regular);
        var activeNavigationFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        void AddNavigation(string title, string glyph, string route)
        {
            bool isDashboard = title == "Dashboard";
            var button = new Button
            {
                Text = glyph + "    " + title,
                Height = 47,
                Width = 240,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding = new Padding(12, 0, 3, 0),
                AutoEllipsis = false,
                FlatStyle = FlatStyle.Flat,
                BackColor = isDashboard
                    ? Color.FromArgb(72, 49, 118)
                    : Color.FromArgb(22, 24, 31),
                ForeColor = isDashboard
                    ? Color.White
                    : Color.FromArgb(194, 194, 208),
                Font = isDashboard ? activeNavigationFont : navigationFont,
                Cursor = Cursors.Hand,
                Margin = new Padding(0, 2, 0, 2),
                TabStop = true
            };
            button.FlatAppearance.BorderSize = 0;
            button.FlatAppearance.MouseOverBackColor = Color.FromArgb(46, 42, 62);

            if (isDashboard)
                activeNavigation = button;

            button.Click += (_, _) =>
            {
                if (_browser.CoreWebView2 is null)
                    return;

                // Navigate between locally packaged workspace tabs using
                // only the hash fragment. This avoids reloading the entire
                // HTML/CSS/WebView document on every sidebar click.
                bool sameWorkspace =
                    route.StartsWith("workspace.html#", StringComparison.Ordinal) &&
                    _browser.Source is { } currentWorkspace &&
                    currentWorkspace.Host == "navdeck-desktop.local" &&
                    currentWorkspace.AbsolutePath == "/workspace.html";
                bool sameFlight =
                    route.StartsWith("flight.html?", StringComparison.Ordinal) &&
                    _browser.Source is { } currentFlight &&
                    currentFlight.Host == "navdeck-desktop.local" &&
                    currentFlight.AbsolutePath == "/flight.html" &&
                    // Only hash-switch when the flight selection itself is
                    // identical. An imported flight ID must never be reused
                    // when the user selects the active reporting shortcut.
                    string.Equals(currentFlight.Query,
                        new Uri("https://navdeck-desktop.local/" + route).Query,
                        StringComparison.Ordinal);
                if (sameWorkspace || sameFlight)
                {
                    int hashPos = route.IndexOf('#');
                    var fragment = hashPos >= 0 ? route.Substring(hashPos) : "";
                    _ = _browser.CoreWebView2.ExecuteScriptAsync(
                        "location.hash = " +
                        System.Text.Json.JsonSerializer.Serialize(fragment));
                }
                else
                {
                    _browser.CoreWebView2.Navigate(
                        "https://navdeck-desktop.local/" + route);
                }

                if (activeNavigation is not null)
                {
                    activeNavigation.BackColor = Color.FromArgb(22, 24, 31);
                    activeNavigation.ForeColor = Color.FromArgb(194, 194, 208);
                    activeNavigation.Font = navigationFont;
                }
                button.BackColor = Color.FromArgb(72, 49, 118);
                button.ForeColor = Color.White;
                button.Font = activeNavigationFont;
                activeNavigation = button;
            };

            navigation.Controls.Add(button);
        }

        AddSection("WORKSPACE");
        AddNavigation("Dashboard", "◈", "map.html");
        // Primary operation: open the live in-flight report in one click.
        // Resolves the currently paired active flight before loading its details.
        AddNavigation("In-Flight Reporting", "▤", "flight.html?active=1#enroute");
        AddNavigation("Touchdown Plotter", "⊙", "touchdown.html");
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
            Height = 132,
            BackColor = Color.FromArgb(22, 24, 31),
            Padding = new Padding(3, 9, 3, 7)
        };

        var footerDivider = new Panel
        {
            Dock = DockStyle.Top,
            Height = 1,
            BackColor = Color.FromArgb(56, 57, 72)
        };

        _simStatus.AutoSize = false;
        _simStatus.TextAlign = ContentAlignment.MiddleLeft;
        _simStatus.Dock = DockStyle.Top;
        _simStatus.Height = 48;
        _simStatus.Font = new Font("Segoe UI", 9, FontStyle.Bold);

        var bridgeButton = new Button
        {
            Text = "◉    Simulator Connection",
            Padding = new Padding(12, 0, 1, 0),
            Dock = DockStyle.Top,
            Height = 45,
            TextAlign = ContentAlignment.MiddleLeft,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(49, 43, 63),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
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
                        getTouchdown: () => request('getTouchdown'),
                        getFlight: () => request('getFlight'),
                        getActiveFlightDetails: () => request('getActiveFlightDetails'),
                        getFlights: () => request('getFlights'),
                        getFlightDetails: (payload) => request('getFlightDetails', payload),
                        flightAction: (payload) => request('flightAction', payload),
                        getMetar: (payload) => request('getMetar', payload),
                        downloadReport: (payload) => request('downloadReport', payload),
                        getLogbook: () => request('getLogbook'),
                        getProfile: () => request('getProfile'),
                        saveProfile: (payload) => request('saveProfile', payload),
                        importSimbrief: (payload) => request('importSimbrief', payload),
                        openSimbrief: (payload) => request('openSimbrief', payload),
                        openVatsim: (payload) => request('openVatsim', payload),
                        getSession: () => request('getSession'),
                        signIn: () => request('signIn'),
                        signOut: () => request('signOut')
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

                        if (action == "getSession")
                        {
                            // Only expose session state, never the desktop token.
                            var session = Config.Load();
                            data = new {
                                paired = Config.IsValidCode(session.Code),
                                auth_mode = session.SignedInWithClerk ? "clerk" : "legacy"
                            };
                        }
                        else if (action == "signIn")
                        {
                            data = new { signed_in = SignInWithClerk() };
                        }
                        else if (action == "signOut")
                        {
                            // Remove local account pairing without touching website sessions.
                            if (_bridge is { IsDisposed: false })
                                _bridge.SignOut();
                            else
                            {
                                var saved = Config.Load();
                                var oldCode = saved.Code;
                                saved.Code = "";
                                saved.SignedInWithClerk = false;
                                saved.Save();
                                DesktopProfileCache.Clear(oldCode);
                            }
                            _cloudApi = null;
                            _cloudCode = null;
                            // Clear Clerk cookies so signing back in cannot
                            // silently restore the previous account.
                            _browser.CoreWebView2?.CookieManager.DeleteAllCookies();
                            data = new { signed_out = true };
                        }
                        else if (action == "getTouchdown")
                        {
                            var t = _bridge?.LastTouchdown;
                            data = new
                            {
                                connected = _bridge?.SimulatorConnected ?? false,
                                aircraft = _bridge?.SimulatorAircraft,
                                touchdown = t is null ? null : new
                                {
                                    time_utc = t.TimeUtc.ToString("O"),
                                    airport = t.Airport,
                                    runway = t.Runway,
                                    distance_from_threshold_m = t.DistanceFromThresholdM,
                                    offset_from_centreline_m = t.OffsetFromCentrelineM,
                                    runway_length_m = t.RunwayLengthM,
                                    runway_width_m = t.RunwayWidthM,
                                    landing_rate_fpm = t.LandingRateFpm,
                                    latitude = t.Latitude,
                                    longitude = t.Longitude
                                }
                            };
                        }
                        else if (action == "getTelemetry")
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
                        else if (action == "openVatsim")
                        {
                            if (!root.TryGetProperty("payload", out var payload) ||
                                !payload.TryGetProperty("url", out var target) ||
                                target.ValueKind != System.Text.Json.JsonValueKind.String ||
                                !Uri.TryCreate(target.GetString(), UriKind.Absolute,
                                    out var external) ||
                                external.Scheme != Uri.UriSchemeHttps ||
                                external.Host != "my.vatsim.net" ||
                                external.AbsolutePath != "/pilots/flightplan" ||
                                external.AbsoluteUri.Length > 5000)
                                throw new ArgumentException("Invalid VATSIM flight-plan link");

                            System.Diagnostics.Process.Start(
                                new System.Diagnostics.ProcessStartInfo
                                {
                                    FileName = external.AbsoluteUri,
                                    UseShellExecute = true
                                });
                            data = new { opened = true };
                        }
                        else if (action == "openSimbrief")
                        {
                            if (!root.TryGetProperty("payload", out var payload) ||
                                !payload.TryGetProperty("url", out var target) ||
                                target.ValueKind != System.Text.Json.JsonValueKind.String ||
                                !Uri.TryCreate(target.GetString(), UriKind.Absolute,
                                    out var external) ||
                                external.Scheme != Uri.UriSchemeHttps ||
                                external.Host != "dispatch.simbrief.com" ||
                                external.AbsolutePath != "/options/custom" ||
                                external.AbsoluteUri.Length > 2048)
                                throw new ArgumentException("Invalid SimBrief planner link");

                            System.Diagnostics.Process.Start(
                                new System.Diagnostics.ProcessStartInfo
                                {
                                    FileName = external.AbsoluteUri,
                                    UseShellExecute = true
                                });
                            data = new { opened = true };
                        }
                        else if (action == "downloadReport")
                        {
                            var config = Config.Load();
                            if (!Config.IsValidCode(config.Code))
                                throw new InvalidOperationException(
                                    "Sign in to NAVDECK from Settings first.");
                            if (!root.TryGetProperty("payload", out var input) ||
                                !input.TryGetProperty("flight_id", out var flight) ||
                                flight.ValueKind != System.Text.Json.JsonValueKind.String ||
                                !Guid.TryParse(flight.GetString(), out var reportId))
                                throw new ArgumentException("Invalid flight ID");

                            if (_cloudApi is null || _cloudCode != config.Code)
                            {
                                _cloudApi = new NavdeckApi(config.Code);
                                _cloudCode = config.Code;
                            }
                            // Ask where to save before downloading any data.
                            using var picker = new SaveFileDialog
                            {
                                Filter = "PDF document (*.pdf)|*.pdf",
                                DefaultExt = "pdf",
                                AddExtension = true,
                                FileName = "NAVDECK-Flight-Report.pdf",
                                Title = "Save NAVDECK signed report"
                            };
                            if (picker.ShowDialog(this) != DialogResult.OK)
                            {
                                data = new { saved = false };
                            }
                            else
                            {
                                var pdf = await _cloudApi.GetReportPdfAsync(
                                    reportId.ToString());
                                await File.WriteAllBytesAsync(picker.FileName, pdf);
                                data = new { saved = true };
                            }
                        }
                        else
                        {
                            var config = Config.Load();
                            System.Text.Json.JsonElement? payload =
                                root.TryGetProperty("payload", out var p)
                                    ? p.Clone() : null;

                            if (action == "flightAction" &&
                                payload is { ValueKind: System.Text.Json.JsonValueKind.Object } instruction &&
                                instruction.TryGetProperty("operation", out var op) &&
                                op.ValueKind == System.Text.Json.JsonValueKind.String &&
                                (op.GetString() is "signReport" or "closeFlight") &&
                                instruction.TryGetProperty("flight_id", out var fid) &&
                                fid.ValueKind == System.Text.Json.JsonValueKind.String &&
                                _bridge?.HasPendingGoAround(fid.GetString() ?? "") == true)
                                throw new InvalidOperationException(
                                    "A go-around was detected but has not yet synced to NAVDECK. " +
                                    "Keep the simulator connection open and retry before signing or closing.");

                            if (!Config.IsValidCode(config.Code))
                            {
                                // Offline profile changes are stored only on
                                // this Windows account, never reported as
                                // successfully synced to NAVDECK.
                                if (action == "saveProfile")
                                    data = DesktopProfileCache.Save(payload, config.Code);
                                else if (action == "getProfile")
                                    data = DesktopProfileCache.ReadFallback(config.Code);
                                else
                                    throw new InvalidOperationException(
                                        "Sign in to NAVDECK with Clerk from Settings.");
                            }
                            else
                            {
                                if (_cloudApi is null || _cloudCode != config.Code)
                                {
                                    _cloudApi = new NavdeckApi(config.Code);
                                    _cloudCode = config.Code;
                                }

                                try
                                {
                                    if (action == "getProfile" &&
                                        DesktopProfileCache.PendingPayload(config.Code) is
                                            { } pending)
                                    {
                                        // Profile was saved locally while
                                        // the desktop API was unavailable.
                                        // First verify that the profile route
                                        // now exists, then sync the pending
                                        // values from the user's prior Save.
                                        await _cloudApi.RequestDesktopAsync("getProfile");
                                        data = await _cloudApi.RequestDesktopAsync(
                                            "saveProfile", pending);
                                        DesktopProfileCache.Clear(config.Code);
                                    }
                                    else
                                    {
                                        data = await _cloudApi.RequestDesktopAsync(
                                            action, payload);
                                        if (action == "saveProfile")
                                            DesktopProfileCache.Clear(config.Code);
                                    }
                                }
                                catch (HttpRequestException ex) when (
                                    (action == "getProfile" || action == "saveProfile") &&
                                    (ex.StatusCode ==
                                        System.Net.HttpStatusCode.NotFound ||
                                     ex.StatusCode is null ||
                                     ex.StatusCode ==
                                        System.Net.HttpStatusCode.BadGateway ||
                                     ex.StatusCode ==
                                        System.Net.HttpStatusCode.ServiceUnavailable))
                                {
                                    data = action == "saveProfile"
                                        ? DesktopProfileCache.Save(payload, config.Code)
                                        : DesktopProfileCache.ReadFallback(config.Code);
                                }
                                catch (TaskCanceledException) when (
                                    action == "getProfile" || action == "saveProfile")
                                {
                                    data = action == "saveProfile"
                                        ? DesktopProfileCache.Save(payload, config.Code)
                                        : DesktopProfileCache.ReadFallback(config.Code);
                                }
                            }
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
                // Initialise the FSUIPC bridge after the main UI is loaded.
                // This prevents the large WinForms simulator control panel
                // from blocking the first paint of the desktop dashboard.
                BeginInvoke(new Action(() =>
                {
                    if (IsDisposed || _bridge is not null)
                        return;
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
                        _bridge.SignInRequested += () =>
                        {
                            try
                            {
                                if (SignInWithClerk())
                                    _browser.CoreWebView2?.Navigate(
                                        "https://navdeck-desktop.local/workspace.html#settings");
                            }
                            catch (Exception error)
                            {
                                MessageBox.Show(this, error.Message, "NAVDECK sign-in",
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            }
                        };
                        _statusTimer.Start();
                        if (!Config.IsValidCode(Config.Load().Code))
                            BeginInvoke(new Action(() =>
                            {
                                if (!IsDisposed && SignInWithClerk())
                                    _browser.CoreWebView2?.Navigate(
                                        "https://navdeck-desktop.local/workspace.html#settings");
                            }));
                    }
                    catch (Exception bridgeError)
                    {
                        _simStatus.Text =
                            "Simulator controls unavailable: " + bridgeError.Message;
                    }
                }));
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
