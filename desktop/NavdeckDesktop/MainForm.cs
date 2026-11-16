namespace NavdeckLink;

internal sealed class MainForm : Form
{
    public bool SimulatorConnected => _sim.IsOpen;
    public Sample? LiveAircraftSample =>
        !_testFlight && _sim.IsOpen && _latestTelemetry is { } sample &&
        DateTime.UtcNow - _latestTelemetryAt < TimeSpan.FromSeconds(5)
            ? sample : null;
    public bool NavdeckConnected => _api is not null;
    public string SimulatorAircraft =>
        _sim.AircraftTitle ?? "Unknown aircraft";
    public string LiveFlightCallsign => _flightCallsign.Text;
    public string LiveFlightRoute => _flightRoute.Text;
    public string LiveFlightStage => _stage.Text;
    public string LiveWaypointSummary => _waypointCount.Text;
    public IReadOnlyList<RouteFix> LivePendingWaypoints => _watcher.Pending;


    private readonly Config _config = Config.Load();
    private readonly FsuipcLink _sim = new();
    private readonly FlightTracker _tracker = new();
    private readonly RunwayDetector _runwayDetector = new();
    private readonly RunwayVisualizer _runwayVisualizer = new();
    private RunwayMatch? _lastRunway;

    private readonly System.Windows.Forms.Timer _poll = new() { Interval = 100 };
    private readonly System.Windows.Forms.Timer _slow = new() { Interval = 5000 };
    private readonly System.Windows.Forms.Timer _routeRefreshTimer = new() { Interval = 5000 };
    private readonly bool _startMinimized;
    private readonly bool _promptForConnectionCode;
    private NavdeckApi? _api;
    private DateTime _lastBeat = DateTime.MinValue;
    private Sample? _latestTelemetry;
    private DateTime _latestTelemetryAt = DateTime.MinValue;
    private bool _telemetrySending;
    private bool _testFlight;
    private readonly WaypointWatcher _watcher = new();
    private DateTime _lastRoute = DateTime.MinValue;
    private readonly Label _nextFix = Theme.Label("", 10f, Theme.Muted);

    private readonly Label _simStatus = Theme.Label("Waiting for FSUIPC7…", 10, Theme.Amber, true);
    private readonly Label _navStatus = Theme.Label("Not connected to NAVDECK", 10, Theme.Amber, true);
    private readonly Label _stage = Theme.Label("Parked", 18, bold: true);
    private readonly Label _times = Theme.Label("", 10.5f);
    private readonly ListBox _log = new() { Width = 470, Height = 150, BackColor = Theme.Card, ForeColor = Theme.Muted, BorderStyle = BorderStyle.None, Font = new Font("Consolas", 9f) };
    private readonly Button _startup;
    private readonly Button _refreshRoute;
    private readonly Label _routeStatus = Theme.Label(
        "Flight plan not yet synchronised", 9, Theme.Muted);
    private bool _routeRefreshing;
    private readonly Label _flightCallsign = Theme.Label("NO ACTIVE FLIGHT", 15, Theme.Text, true);
    private readonly Label _flightRoute = Theme.Label("Departure —  →  Destination —", 11, Theme.Muted);
    private readonly Label _waypointCount = Theme.Label("0 remaining waypoints", 10, Theme.Cyan, true);

    private readonly Label _altitudeValue = Theme.Label("— ft", 19, Theme.Text, true);
    private readonly Label _speedValue = Theme.Label("— kt", 19, Theme.Text, true);
    private readonly Label _positionValue = Theme.Label("Waiting for simulator", 10, Theme.Muted);


    private readonly Label _fuelValue = Theme.Label("—", 12, Theme.Text, true);
    private readonly ComboBox _fuelUnit = new()
    {
        DropDownStyle = ComboBoxStyle.DropDownList,
        Width = 125,
        BackColor = Theme.Card,
        ForeColor = Theme.Text,
        Font = new Font("Segoe UI", 9.5f)
    };



    public MainForm(bool startMinimized, bool promptForConnectionCode = true)
    {
        _startMinimized = startMinimized;
        _promptForConnectionCode = promptForConnectionCode;
        Text = "NAVDECK Link";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Theme.Bg;
        ForeColor = Theme.Text;
        FormBorderStyle = FormBorderStyle.Sizable;
        MaximizeBox = true;
        AutoSize = false;
        MinimumSize = new Size(760, 620);
        ClientSize = new Size(900, 720);
        Padding = new Padding(24);
        StartPosition = FormStartPosition.CenterScreen;


        MinimumSize = new Size(900, 720);
        ClientSize = new Size(1100, 850);
        Padding = new Padding(0);

        _startup = Theme.Button("OPEN WITH SIMULATOR", Theme.Line,
            (_, _) => ToggleStartup());

        _refreshRoute = Theme.Button("REFRESH FLIGHT PLAN", Theme.Accent,
            async (_, _) => await RefreshRoute());

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            BackColor = Theme.Bg,
            Padding = new Padding(24),
            AutoScroll = true,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink
        };

        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));


        // SYSTEM CONNECTIONS
        var connections = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 160,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Theme.Bg,
            Margin = new Padding(0, 0, 0, 14)
        };

        connections.ColumnStyles.Add(
            new ColumnStyle(SizeType.Percent, 50));
        connections.ColumnStyles.Add(
            new ColumnStyle(SizeType.Percent, 50));

        connections.Controls.Add(
            CreateCard("SIMULATOR CONNECTION",
                Theme.Label("FSUIPC7 / MICROSOFT FLIGHT SIMULATOR",
                    9, Theme.Muted, true), _simStatus), 0, 0);

        connections.Controls.Add(
            CreateCard("NAVDECK CLOUD CONNECTION",
                Theme.Label("LIVE FLIGHT PLAN SYNCHRONISATION",
                    9, Theme.Muted, true), _navStatus), 1, 0);

        root.Controls.Add(connections, 0, 0);

        // ACTIVE FLIGHT
        var flight = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            BackColor = Theme.Card,
            Padding = new Padding(10, 4, 10, 4),
            Margin = Padding.Empty
        };

        flight.ColumnStyles.Add(
            new ColumnStyle(SizeType.Percent, 100));

        for (int i = 0; i < 5; i++)
            flight.RowStyles.Add(
                new RowStyle(SizeType.Percent, 20));

        Control[] flightDetails =
        {
            Theme.Label("ACTIVE FLIGHT", 9, Theme.Cyan, true),
            _flightCallsign,
            _flightRoute,
            _waypointCount,
            _routeStatus
        };

        for (int i = 0; i < flightDetails.Length; i++)
        {
            var detail = flightDetails[i];
            detail.Dock = DockStyle.Fill;
            detail.AutoSize = false;
            if (detail is Label label)
                label.AutoEllipsis = false;
            detail.Margin = new Padding(0, 2, 0, 2);
            flight.Controls.Add(detail, 0, i);
        }

        var flightCard = CreateCard("FLIGHT INFORMATION", flight);
        flightCard.Height = 300;
        flightCard.MinimumSize = new Size(0, 300);
        root.Controls.Add(flightCard, 0, 1);

        // LIVE TELEMETRY
        var telemetry = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 125,
            ColumnCount = 4,
            RowCount = 1,
            BackColor = Theme.Bg,
            Margin = new Padding(0, 14, 0, 14)
        };

        for (int i = 0; i < 4; i++)
            telemetry.ColumnStyles.Add(
                new ColumnStyle(SizeType.Percent, 25));

        telemetry.Controls.Add(
            CreateCard("ALTITUDE", _altitudeValue), 0, 0);

        telemetry.Controls.Add(
            CreateCard("GROUND SPEED", _speedValue), 1, 0);

        var fuelDisplay = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Card,
            ColumnCount = 2,
            RowCount = 1,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };

        fuelDisplay.ColumnStyles.Add(
            new ColumnStyle(SizeType.Percent, 100));
        fuelDisplay.ColumnStyles.Add(
            new ColumnStyle(SizeType.Absolute, 75));

        _fuelValue.Dock = DockStyle.Fill;
        _fuelValue.TextAlign = ContentAlignment.MiddleLeft;

        _fuelUnit.Dock = DockStyle.Fill;
        _fuelUnit.DropDownStyle = ComboBoxStyle.DropDownList;
        _fuelUnit.Margin = new Padding(4, 6, 0, 6);

        fuelDisplay.Controls.Add(_fuelValue, 0, 0);

        _fuelUnit.Items.Clear();
        _fuelUnit.Items.AddRange(new object[]
        {
            "LB",
            "KG"
        });

        _fuelUnit.SelectedIndex = _config.FuelUnit == "kg" ? 1 : 0;

        _fuelUnit.SelectedIndexChanged += (_, _) =>
        {
            _config.FuelUnit =
                _fuelUnit.SelectedIndex == 1 ? "kg" : "lb";
            _config.Save();
            RefreshView();
        };

        fuelDisplay.Controls.Add(_fuelUnit, 1, 0);

        telemetry.Controls.Add(
            CreateCard("FUEL ON BOARD", fuelDisplay), 2, 0);

        telemetry.Controls.Add(
            CreateCard("AIRCRAFT POSITION", _positionValue), 3, 0);

        root.Controls.Add(telemetry, 0, 2);

        // FLIGHT OPERATIONS
        var operations = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 175,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Theme.Bg,
            Margin = new Padding(0, 0, 0, 14)
        };

        operations.ColumnStyles.Add(
            new ColumnStyle(SizeType.Percent, 55));
        operations.ColumnStyles.Add(
            new ColumnStyle(SizeType.Percent, 45));

        var phase = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Theme.Card,
            Padding = new Padding(16)
        };

        phase.Controls.Add(Theme.Label("FLIGHT PHASE", 9, Theme.Cyan, true));
        phase.Controls.Add(_stage);
        phase.Controls.Add(_times);
        phase.Controls.Add(_nextFix);

        operations.Controls.Add(
            CreateCard("FLIGHT STATUS", phase), 0, 0);

        var controls = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoScroll = false,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Theme.Card,
            Padding = new Padding(12)
        };

        _refreshRoute.MinimumSize = new Size(280, 48);
        _refreshRoute.Font = new Font("Segoe UI", 10f, FontStyle.Bold);


        

        controls.Controls.Add(Theme.Button(
            "CONNECTION CODE", Theme.Accent,
            (_, _) => AskCode()));

        _startup.MinimumSize = new Size(280, 42);
        controls.Controls.Add(_startup);

        controls.Controls.Add(Theme.Button(
            "TEST FLIGHT", Theme.Line,
            (_, _) => RunTestFlight()));

        controls.Controls.Add(Theme.Button(
            "NEW FLIGHT", Theme.Line,
            async (_, _) =>
            {
                _tracker.Reset();
                _watcher.Reset();
                Log("Ready for a new flight");
                await RefreshRoute();
                RefreshView();
            }));

        var refreshPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Card,
            Padding = new Padding(18)
        };

        _refreshRoute.Dock = DockStyle.Top;
        _refreshRoute.MinimumSize = new Size(0, 48);
        refreshPanel.Controls.Add(_refreshRoute);

        operations.Controls.Add(
            CreateCard("FLIGHT PLAN", refreshPanel), 1, 0);

        root.Controls.Add(operations, 0, 3);

        // ACTIVITY LOG
        _log.Dock = DockStyle.Fill;
        _log.BackColor = Theme.Card;
        _log.ForeColor = Theme.Text;
        _log.Font = new Font("Consolas", 9f);

        var activity = CreateCard("FLIGHT ACTIVITY", _log);
        activity.Dock = DockStyle.Fill;
        activity.MinimumSize = new Size(0, 230);



        // NAVDECK_PAGE_NAVIGATION_V2
        var dashboardPage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Bg
        };
        dashboardPage.AutoScroll = true;
        dashboardPage.Controls.Add(root);

        var flightControlsPage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Bg,
            Visible = false,
            Padding = new Padding(24)
        };

        var controlsCard = CreateCard("FLIGHT CONTROLS", controls);
        controlsCard.Dock = DockStyle.Top;
        controlsCard.Height = 370;
        flightControlsPage.Controls.Add(controlsCard);

        // Separate touchdown plotter page.
        var touchdownPage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Bg,
            Padding = new Padding(24),
            Visible = false
        };

        _runwayVisualizer.Dock = DockStyle.Fill;
        touchdownPage.Controls.Add(_runwayVisualizer);

        // Separate flight activity page.
        var activityPage = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Bg,
            Padding = new Padding(24),
            Visible = false
        };

        activity.Dock = DockStyle.Fill;
        activityPage.Controls.Add(activity);

        var pageHost = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Bg,
            Padding = new Padding(0, 48, 0, 0)
        };

        pageHost.Controls.Add(dashboardPage);
        pageHost.Controls.Add(flightControlsPage);
        pageHost.Controls.Add(touchdownPage);
        pageHost.Controls.Add(activityPage);

        // Right-aligned navigation, fixed above page content.
        var navigation = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 62,
            BackColor = Theme.Bg,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            Padding = new Padding(8)
        };

        Panel[] pages = Array.Empty<Panel>();
        Button[] tabs = Array.Empty<Button>();

        Button dashboardTab = null!;
        Button controlsTab = null!;
        Button touchdownTab = null!;
        Button activityTab = null!;

        dashboardTab = Theme.Button("DASHBOARD", Theme.Accent,
            (_, _) => ShowPage(0));
        dashboardTab.Size = new Size(145, 42);

        controlsTab = Theme.Button("FLIGHT CONTROLS", Theme.Line,
            (_, _) => ShowPage(1));
        controlsTab.Size = new Size(165, 42);

        touchdownTab = Theme.Button("TOUCHDOWN PLOTTER", Theme.Line,
            (_, _) => ShowPage(2));
        touchdownTab.Size = new Size(185, 42);

        activityTab = Theme.Button("FLIGHT ACTIVITY", Theme.Line,
            (_, _) => ShowPage(3));
        activityTab.Size = new Size(165, 42);

        // RightToLeft flow places the first control at the far right.
        navigation.Controls.Add(activityTab);
        navigation.Controls.Add(touchdownTab);
        navigation.Controls.Add(controlsTab);
        navigation.Controls.Add(dashboardTab);

        pages = new Panel[]
        {
            dashboardPage,
            flightControlsPage,
            touchdownPage,
            activityPage
        };

        tabs = new Button[]
        {
            dashboardTab,
            controlsTab,
            touchdownTab,
            activityTab
        };

        void ShowPage(int selected)
        {
            for (int i = 0; i < pages.Length; i++)
                pages[i].Visible = i == selected;

            pages[selected].BringToFront();

            for (int i = 0; i < tabs.Length; i++)
                tabs[i].BackColor =
                    i == selected ? Theme.Accent : Theme.Line;
        }

        Controls.Add(pageHost);
        Controls.Add(navigation);
        navigation.BringToFront();
        ShowPage(0);


        _poll.Tick += (_, _) => Poll();
        _slow.Tick += async (_, _) => await SlowTick();
        // Automatic flight plan refresh disabled; user must refresh manually.
        Shown += async (_, _) => await Start();
        FormClosing += async (_, _) => await Shutdown();
    }


    private static Panel CreateCard(string heading, params Control[] contents)
    {
        var card = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Card,
            Padding = new Padding(14),
            Margin = new Padding(5)
        };

        var title = Theme.Label(heading, 9, Theme.Cyan, true);
        title.Dock = DockStyle.Top;
        title.Height = 24;
        title.AutoSize = false;

        var body = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Card,
            Padding = new Padding(0, 8, 0, 0)
        };

        if (contents.Length == 1)
        {
            var content = contents[0];
            content.Dock = DockStyle.Fill;
            content.Margin = Padding.Empty;
            body.Controls.Add(content);
        }
        else
        {
            var flow = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoScroll = false,
                AutoSize = false
            };

            foreach (var content in contents)
            {
                content.Margin = new Padding(0, 3, 0, 5);
                flow.Controls.Add(content);
            }

            body.Controls.Add(flow);
        }

        card.Controls.Add(body);
        card.Controls.Add(title);

        // Rounded card corners, including when resized.
        void ApplyRoundedCorners()
        {
            if (card.Width <= 0 || card.Height <= 0)
                return;

            const int radius = 12;
            int diameter = radius * 2;

            using var path = new System.Drawing.Drawing2D.GraphicsPath();

            path.AddArc(0, 0, diameter, diameter, 180, 90);
            path.AddArc(card.Width - diameter, 0, diameter, diameter, 270, 90);
            path.AddArc(card.Width - diameter, card.Height - diameter,
                        diameter, diameter, 0, 90);
            path.AddArc(0, card.Height - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();

            var oldRegion = card.Region;
            card.Region = new Region(path);
            oldRegion?.Dispose();
        }

        card.Resize += (_, _) => ApplyRoundedCorners();
        ApplyRoundedCorners();

        return card;
    }

    private async Task Start()
    {
        if (_startMinimized) WindowState = FormWindowState.Minimized;
        if (Config.IsValidCode(_config.Code))
            await Connect();
        else if (_promptForConnectionCode)
            AskCode();
        else
            SetStatus(_navStatus,
                "Open Simulator Connection to enter your NAVDECK link code",
                Theme.Amber);
        UpdateStartupButton();
        RefreshView();
        _poll.Start();
        _slow.Start();
        // Flight plan refresh is manual only.
        await SlowTick();
    }

    private void AskCode()
    {
        using var dlg = new CodeDialog(_config.Code);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        _config.Code = dlg.Code;
        _config.Save();
        _ = Connect();
    }

    private async Task Connect()
    {
        _api = new NavdeckApi(_config.Code);
        try
        {
            var f = await _api.GetFlightAsync();
            SetStatus(_navStatus, f is null ? "NAVDECK connected · import a flight before pushback" : $"Filling {f.Callsign} {f.Origin} → {f.Destination}", f is null ? Theme.Amber : Theme.Green);
            if (f is not null)
            {
                _watcher.SetRoute(f.Pending);
                _flightCallsign.Text = string.IsNullOrWhiteSpace(f.Callsign)
                    ? "ACTIVE FLIGHT" : f.Callsign;
                _flightRoute.Text = $"{f.Origin ?? "—"}  →  {f.Destination ?? "—"}";
                _waypointCount.Text = $"{f.Pending.Count} pending waypoints";
                _routeStatus.Text = $"Flight plan synchronised · {DateTime.UtcNow:HH:mm}Z";
            }
            else
            {
                _watcher.Reset();
                _flightCallsign.Text = "NO ACTIVE FLIGHT";
                _flightRoute.Text = "Departure —  →  Destination —";
                _waypointCount.Text = "0 pending waypoints";
            }
            _lastRoute = DateTime.UtcNow;
        }
        catch (AuthException ex)
        {
            _api = null;
            SetStatus(_navStatus, "Connection code not accepted", Theme.Red);
            Log(ex.Message);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            SetStatus(_navStatus, "Can't reach NAVDECK · retrying", Theme.Amber);
        }
    }

    private void Poll()
    {
        if (_testFlight || !_sim.IsOpen) return;
        if (_sim.Read() is not { } s)
        {
            _latestTelemetry = null;
            SetStatus(_simStatus, "Sim disconnected · waiting for FSUIPC7…", Theme.Amber);
            return;
        }
        _latestTelemetry = s;
        _latestTelemetryAt = DateTime.UtcNow;
        OnSimEvent(_tracker.Update(s, DateTime.UtcNow));
        if (_tracker.Stage == Stage.Airborne && _watcher.Update(s.Lat, s.Lon) is { } fix) _ = LogFix(fix, s);
    }

    // Picks up directs and manual entries made in NAVDECK so the next fix stays in step
    private async Task RefreshRoute()
    {
        if (_api is null || _routeRefreshing) return;

        _routeRefreshing = true;
        _refreshRoute.Enabled = false;
        _refreshRoute.Text = "Refreshing...";

        try
        {
            var f = await _api.GetFlightAsync();

            if (f is not null)
            {
                _watcher.SetRoute(f.Pending);
                _flightCallsign.Text = string.IsNullOrWhiteSpace(f.Callsign)
                    ? "ACTIVE FLIGHT" : f.Callsign;
                _flightRoute.Text = $"{f.Origin ?? "—"}  →  {f.Destination ?? "—"}";
                _waypointCount.Text = $"{f.Pending.Count} pending waypoints";
                _routeStatus.Text =
                    $"Flight plan: {f.Callsign} · {f.Origin} → {f.Destination} · Synced {DateTime.Now:HH:mm:ss}";
                SetStatus(_navStatus,
                    $"Filling {f.Callsign} {f.Origin} → {f.Destination}",
                    Theme.Green);
            }
            else
            {
                _flightCallsign.Text = "NO ACTIVE FLIGHT";
                _flightRoute.Text = "Departure —  →  Destination —";
                _waypointCount.Text = "0 pending waypoints";
                _routeStatus.Text =
                    $"No open flight · Checked {DateTime.Now:HH:mm:ss}";
            }

            _lastRoute = DateTime.UtcNow;
        }
        catch (Exception ex) when (
            ex is HttpRequestException or TaskCanceledException or AuthException)
        {
            _routeStatus.Text =
                $"Refresh failed · Retrying automatically · {DateTime.Now:HH:mm:ss}";
            Log($"Flight plan refresh failed: {ex.Message}");
        }
        finally
        {
            _routeRefreshing = false;
            _refreshRoute.Enabled = true;
            _refreshRoute.Text = "Refresh flight plan";
        }
    }

    private async Task LogFix(RouteFix fix, Sample s)
    {
        var alt = (int)Math.Round(s.AltFt / 10) * 10;
        Log($"{DateTime.UtcNow:HH:mm}z passed {fix.Ident} · {alt:N0} ft · {s.FuelLb:N0} lb");
        if (_api is null) return;
        try
        {
            var applied = await _api.SendWaypointAsync(fix, s.FuelLb > 0 ? s.FuelLb : null, alt);
            Log(applied.Length > 0 ? $"  NAVDECK updated: {string.Join(", ", applied)}" : "  already filled in NAVDECK");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or AuthException)
        {
            Log($"  not sent: {ex.Message}");
        }
    }


    private async Task SlowTick()
    {
        if (!_testFlight && !_sim.IsOpen && _sim.TryOpen())
        {
            _sim.Read();
            SetStatus(_simStatus, $"Sim connected · {_sim.AircraftTitle}", Theme.Green);
            Log("Connected to MSFS through FSUIPC7");
        }
        if (_api is null && Config.IsValidCode(_config.Code) && _navStatus.ForeColor != Theme.Red) await Connect();

        if (_api is not null && DateTime.UtcNow - _lastBeat > TimeSpan.FromSeconds(30))
        {
            _lastBeat = DateTime.UtcNow;
            try { await _api.HeartbeatAsync(_sim.AircraftTitle, _sim.IsOpen || _testFlight); }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or AuthException) { }
        }
        if (!_telemetrySending && !_testFlight && _sim.IsOpen &&
            _api is not null && _latestTelemetry is { } sample &&
            DateTime.UtcNow - _latestTelemetryAt < TimeSpan.FromSeconds(10))
        {
            _telemetrySending = true;
            try
            {
                await _api.SendTelemetryAsync(sample);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or AuthException)
            {
                // Telemetry errors must not interrupt flight tracking.
            }
            finally
            {
                _telemetrySending = false;
            }
        }

        RefreshView();
    }

    private async void OnSimEvent(SimEvent? e)
    {
        if (e is null) return;

        if (e.Type == "landing")
        {
            var lat = _tracker.TouchdownLat;
            var lon = _tracker.TouchdownLon;
            var track = _tracker.ApproachTrackDeg;

            _lastRunway = lat.HasValue && lon.HasValue && track.HasValue
                ? _runwayDetector.Find(lat.Value, lon.Value, track.Value)
                : null;

            _runwayVisualizer.UpdateTouchdown(_lastRunway);

            if (_lastRunway is { } runway)
                Log($"Touchdown: {runway.Airport} RWY {runway.Runway}, " +
                    $"{runway.DistanceFromThresholdM:N0} m from threshold, " +
                    $"{Math.Abs(runway.OffsetFromCentrelineM):N0} m from centreline");
            else
                Log("Touchdown runway could not be identified automatically.");
        }

        RefreshView();
        var label = e.Type switch { "off" => "Gate out", "takeoff" => "Takeoff", "landing" => $"Landing · {e.LandingRate} fpm", _ => "Gate in" };
        Log($"{DateTime.UtcNow:HH:mm}z {label}");
        if (_api is null)
        {
            Log("  not sent: connect to NAVDECK first");
            return;
        }
        try
        {
            var applied = await _api.SendEventAsync(e.Type, e.LandingRate, e.FuelLb);
            Log(applied.Length > 0 ? $"  NAVDECK updated: {string.Join(", ", applied)}" : "  already filled in NAVDECK");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or AuthException)
        {
            Log($"  not sent: {ex.Message}");
        }
    }

    // Plays a 20-second pretend flight so you can check the link without starting the sim
    private async void RunTestFlight()
    {
        if (_testFlight) return;
        _testFlight = true;
        _tracker.Reset();
        Log("Test flight started");
        var script = new List<Sample>();
        script.AddRange(Enumerable.Repeat(new Sample(true, 0, 0, true, 9800), 5));
        script.AddRange(Enumerable.Repeat(new Sample(true, 12, 0, false, 9800), 30));
        script.AddRange(Enumerable.Repeat(new Sample(false, 150, 0, false, 9700), 40));
        script.Add(new Sample(true, 130, -142, false, 9600));
        script.AddRange(Enumerable.Repeat(new Sample(true, 15, -142, false, 9600), 20));
        script.AddRange(Enumerable.Repeat(new Sample(true, 0, -142, true, 9600), 70));
        foreach (var s in script)
        {
            OnSimEvent(_tracker.Update(s, DateTime.UtcNow));
            await Task.Delay(100);
            if (_tracker.Stage == Stage.Arrived) break;
        }
        Log("Test flight finished · press New flight before your real flight");
        _testFlight = false;
    }

    private void ToggleStartup()
    {
        var ini = Fsuipc7Setup.FindIni();
        if (ini is null)
        {
            using var pick = new OpenFileDialog { Title = "Find FSUIPC7.ini (in your FSUIPC7 folder)", Filter = "FSUIPC7.ini|FSUIPC7.ini" };
            if (pick.ShowDialog(this) != DialogResult.OK) return;
            ini = pick.FileName;
        }
        try
        {
            if (Fsuipc7Setup.IsInstalled(ini))
            {
                Fsuipc7Setup.Uninstall(ini);
                Log("Removed from FSUIPC7 start-up");
            }
            else
            {
                Fsuipc7Setup.Install(ini, Application.ExecutablePath);
                Log("Added to FSUIPC7: opens when MSFS is ready, closes with the sim");
                MessageBox.Show(this, "Done. Restart FSUIPC7 (or MSFS) once so it picks this up.\n\nKeep NavdeckLink.exe where it is now; if you move it, click this button again.", "NAVDECK Link", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            MessageBox.Show(this, $"Couldn't update FSUIPC7.ini: {ex.Message}\n\nIf FSUIPC7 is installed under Program Files, run NAVDECK Link as administrator once.", "NAVDECK Link", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        UpdateStartupButton();
    }

    private void UpdateStartupButton()
    {
        var ini = Fsuipc7Setup.FindIni();
        var on = ini is not null && Fsuipc7Setup.IsInstalled(ini);
        _startup.Text = on ? "Opens with sim ✓" : "Open with simulator";
        _startup.BackColor = on ? Theme.Green : Theme.Line;
    }

    private void RefreshView()
    {
        if (_latestTelemetry is { } telemetry &&
            DateTime.UtcNow - _latestTelemetryAt < TimeSpan.FromSeconds(10))
        {
            _altitudeValue.Text = $"{telemetry.AltFt:N0} ft";
            _speedValue.Text = $"{telemetry.GroundSpeedKt:N0} kt";
            _positionValue.Text =
                $"{telemetry.Lat:F4}, {telemetry.Lon:F4}";

            _fuelValue.Text = _config.FuelUnit == "kg"
                ? $"{telemetry.FuelLb * 0.45359237:N0} kg"
                : $"{telemetry.FuelLb:N0} lb";
        }
        else
        {
            _altitudeValue.Text = "— ft";
            _speedValue.Text = "— kt";
            _positionValue.Text = "Waiting for simulator";
            _fuelValue.Text = "—";
        }


        if (_latestTelemetry is { } sample &&
            DateTime.UtcNow - _latestTelemetryAt < TimeSpan.FromSeconds(10))
        {
            var fuel = sample.FuelLb;

            _fuelValue.Text = _config.FuelUnit == "kg"
                ? $"{fuel * 0.45359237:N0} kg"
                : $"{fuel:N0} lb";
        }
        else
        {
            _fuelValue.Text = "—";
        }


        _stage.Text = _tracker.Stage switch
        {
            Stage.Parked => "Parked at gate",
            Stage.TaxiOut => "Pushback / taxi out",
            Stage.Airborne => "Airborne",
            Stage.TaxiIn => "Taxi in",
            _ => "Arrived",
        };
        static string T(DateTime? d) => d is { } v ? $"{v:HH:mm}z" : "--:--";
        static string D(TimeSpan? t) => t is { } v ? $"{(int)v.TotalHours}:{v.Minutes:00}" : "-:--";
        _times.Text =
            $"Gate out  {T(_tracker.GateOut)}     Takeoff  {T(_tracker.Takeoff)}\n" +
            $"Landing   {T(_tracker.Landing)}     Gate in  {T(_tracker.GateIn)}\n" +
            $"Air time  {D(_tracker.AirTime)}      Block   {D(_tracker.BlockTime)}\n" +
            $"Touchdown {(_tracker.LandingRate is { } r ? $"{r} fpm" : "—")}";
        _nextFix.Text = _watcher.Next is { } n
            ? $"Next fix {n.Ident}{(_watcher.DistanceToNext is { } dist && _tracker.Stage == Stage.Airborne ? $" · {dist:0} nm" : "")} · time, fuel and altitude log automatically"
            : "No navlog fixes with positions to log";
    }

    private static void SetStatus(Label l, string text, Color c)
    {
        l.Text = text;
        l.ForeColor = c;
    }

    private void Log(string line)
    {
        _log.Items.Insert(0, line);
        while (_log.Items.Count > 200) _log.Items.RemoveAt(_log.Items.Count - 1);
    }

    private async Task Shutdown()
    {
        _poll.Stop();
        _slow.Stop();
        _routeRefreshTimer.Stop();
        if (_api is not null)
        {
            try { await _api.HeartbeatAsync(_sim.AircraftTitle, false).WaitAsync(TimeSpan.FromSeconds(2)); }
            catch (Exception) { }
        }
        _sim.Dispose();
    }
}
