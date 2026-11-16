using System.Diagnostics;

namespace NavdeckLogbook;

internal sealed class MainForm : Form
{
    private readonly LogbookStore _store = new();
    private readonly FlightRecorder _rec;
    private readonly CancellationTokenSource _cts = new();
    private readonly List<FlightRecord> _flights = [];
    private readonly NotifyIcon _tray = new();
    private AppSettings _settings;
    private bool _startHidden;
    private bool _reallyExit;
    private bool _connected;
    private bool _suppress;
    private Sample? _last;
    private string _wpKey = "";
    private FlightRecord? _detailFlight;

    // header / footer
    private readonly Label _status = Theme.Lbl("", 9.5f, Theme.Warn, true, ContentAlignment.MiddleRight);
    private readonly Button _navLive = Theme.Btn("LIVE FLIGHT");
    private readonly Button _navLog = Theme.Btn("LOGBOOK");
    private readonly Label _event = Theme.Lbl("", 9f, Theme.Muted);

    // live view
    private readonly Panel _livePanel = new() { Dock = DockStyle.Fill, BackColor = Theme.Bg };
    private readonly Label _route = Theme.Lbl("----  →  ----", 24f, Theme.Text, true);
    private readonly Label _sub = Theme.Lbl("", 10f, Theme.Muted);
    private readonly TextBox _callsign = new();
    private readonly Button _simbriefBtn = Theme.Btn("Load SimBrief plan");
    private readonly PhaseBar _phase = new() { Dock = DockStyle.Fill };
    private readonly Label _telemetry = Theme.Lbl("", 10f, Theme.Text);
    private readonly Label[] _evTime = new Label[4];
    private readonly Label[] _evFuel = new Label[4];
    private readonly Label _summary = Theme.Lbl("", 10f, Theme.Text, true);
    private readonly Label _rate = Theme.Lbl("--", 28f, Theme.Text, true);
    private readonly Label _rating = Theme.Lbl("", 11f, Theme.Muted, true, ContentAlignment.TopLeft);
    private readonly Label _rwyLine = Theme.Lbl("");
    private readonly Label _distLine = Theme.Lbl("");
    private readonly Label _offLine = Theme.Lbl("");
    private readonly Label _gsLine = Theme.Lbl("");
    private readonly PlotterPanel _plotter = new() { Dock = DockStyle.Fill };
    private readonly DarkList _wpList = new() { Dock = DockStyle.Fill };
    private readonly Card _doneCard = new("FLIGHT COMPLETE") { Dock = DockStyle.Fill, Height = 96, Visible = false };
    private readonly Label _doneText = Theme.Lbl("", 10f, Theme.Text, true);

    // logbook view
    private readonly Panel _logPanel = new() { Dock = DockStyle.Fill, BackColor = Theme.Bg, Visible = false };
    private readonly DarkList _flightList = new() { Dock = DockStyle.Fill };
    private readonly Label _detailTitle = Theme.Lbl("No flight selected", 16f, Theme.Text, true);
    private readonly Label _detailText = Theme.Lbl("", 9.5f, Theme.Text, false, ContentAlignment.TopLeft);
    private readonly PictureBox _detailPlot = new() { Dock = DockStyle.Fill, SizeMode = PictureBoxSizeMode.Zoom, BackColor = Theme.Card };
    private readonly Button _pdfBtn = Theme.Btn("Save as PDF...", primary: true);
    private readonly Button _deleteBtn = Theme.Btn("Delete");
    private readonly Button _csvBtn = Theme.Btn("Export all (CSV)");

    public MainForm(bool startMinimized)
    {
        _startHidden = startMinimized;
        _settings = _store.LoadSettings();

        // The runway database loads in the background; the window never waits for it.
        _rec = new FlightRecorder(Task.Run(() => RunwayDb.LoadEmbedded()));
        _rec.Changed += RefreshLive;
        _rec.Message += SetEvent;
        _rec.FlightCompleted += OnFlightCompleted;

        Text = "NAVDECK Logbook";
        ClientSize = new Size(1180, 760);
        MinimumSize = new Size(1020, 700);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Theme.Bg;
        ForeColor = Theme.Text;
        Font = Theme.Ui(9.5f);
        DoubleBuffered = true;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

        BuildUi();
        BuildTray();
        CreateHandle();

        SetConnected(false);
        SetView(live: true);
        RefreshLive();
        SetEvent("Ready. Flights are recorded automatically and saved on this PC.");

        _ = Task.Run(() => _store.LoadAll()).ContinueWith(t =>
        {
            if (!t.IsCompletedSuccessfully) return;
            Post(() =>
            {
                // Keep anything completed while the saved flights were still loading.
                var loaded = t.Result.Where(x => _flights.All(y => y.Id != x.Id)).ToList();
                _flights.AddRange(loaded);
                _flights.Sort((a, b) => (b.StartUtc ?? DateTime.MinValue).CompareTo(a.StartUtc ?? DateTime.MinValue));
                FillFlightList(null);
            });
        });

        Task.Factory.StartNew(PollLoop, TaskCreationOptions.LongRunning);

        if (!string.IsNullOrWhiteSpace(_settings.SimBriefUser))
            _ = LoadSimBriefAsync(silent: true);
    }

    // ------------------------------------------------------------------ layout

    private static TableLayoutPanel Grid(int columns, int rows) => new()
    {
        Dock = DockStyle.Fill,
        ColumnCount = columns,
        RowCount = rows,
        BackColor = Color.Transparent,
        Margin = new Padding(0),
        Padding = new Padding(0),
    };

    private void BuildUi()
    {
        var root = Grid(1, 3);
        root.BackColor = Theme.Bg;
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        // header
        var header = Grid(6, 1);
        header.Padding = new Padding(20, 14, 20, 12);
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 240));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 140));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 300));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 116));
        header.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var settingsBtn = Theme.Btn("Settings");
        foreach (var b in new[] { _navLive, _navLog, settingsBtn })
        {
            b.Dock = DockStyle.Fill;
            b.Margin = new Padding(4, 0, 4, 0);
        }
        _navLive.Click += (_, _) => SetView(live: true);
        _navLog.Click += (_, _) => SetView(live: false);
        settingsBtn.Click += (_, _) => OpenSettings();

        header.Controls.Add(Theme.Lbl("NAVDECK  LOGBOOK", 15f, Theme.Accent, true), 0, 0);
        header.Controls.Add(_navLive, 1, 0);
        header.Controls.Add(_navLog, 2, 0);
        header.Controls.Add(_status, 4, 0);
        header.Controls.Add(settingsBtn, 5, 0);

        // content
        var content = new Panel { Dock = DockStyle.Fill, Padding = new Padding(20, 4, 20, 4), BackColor = Theme.Bg };
        BuildLive();
        BuildLogbook();
        content.Controls.Add(_livePanel);
        content.Controls.Add(_logPanel);

        // footer
        var footer = new Panel { Dock = DockStyle.Fill, Padding = new Padding(22, 0, 22, 8), BackColor = Theme.Bg };
        footer.Controls.Add(_event);

        root.Controls.Add(header, 0, 0);
        root.Controls.Add(content, 0, 1);
        root.Controls.Add(footer, 0, 2);
        Controls.Add(root);
    }

    private void BuildLive()
    {
        var split = Grid(2, 1);
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 58));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        split.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        // ---- left column
        var left = Grid(1, 3);
        left.Padding = new Padding(0, 0, 12, 0);
        left.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 218));
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 172));
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var flightCard = new Card("CURRENT FLIGHT") { Dock = DockStyle.Fill };
        var flight = Grid(1, 4);
        flight.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        flight.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        flight.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        flight.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        flight.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var subRow = Grid(3, 1);
        subRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        subRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        subRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        subRow.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        _callsign.PlaceholderText = "Callsign / flight no.";
        _callsign.BackColor = Theme.Bg;
        _callsign.ForeColor = Theme.Text;
        _callsign.BorderStyle = BorderStyle.FixedSingle;
        _callsign.Font = Theme.Ui(10f, true);
        _callsign.CharacterCasing = CharacterCasing.Upper;
        _callsign.MaxLength = 12;
        _callsign.Dock = DockStyle.Fill;
        _callsign.Margin = new Padding(6, 4, 6, 4);
        _callsign.TextChanged += (_, _) => OnCallsignEdited();

        _simbriefBtn.Dock = DockStyle.Fill;
        _simbriefBtn.Font = Theme.Ui(8.5f, true);
        _simbriefBtn.Margin = new Padding(0, 2, 0, 2);
        _simbriefBtn.Click += (_, _) => _ = LoadSimBriefAsync(silent: false);

        subRow.Controls.Add(_sub, 0, 0);
        subRow.Controls.Add(_callsign, 1, 0);
        subRow.Controls.Add(_simbriefBtn, 2, 0);

        flight.Controls.Add(_route, 0, 0);
        flight.Controls.Add(subRow, 0, 1);
        flight.Controls.Add(_phase, 0, 2);
        flight.Controls.Add(_telemetry, 0, 3);
        flightCard.Controls.Add(flight);

        var timesCard = new Card("TIMES AND FUEL") { Dock = DockStyle.Fill };
        var times = Grid(4, 4);
        for (var i = 0; i < 4; i++) times.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        times.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        times.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        times.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        times.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var names = new[] { "GATE OUT", "TAKE-OFF", "LANDING", "GATE IN" };
        for (var i = 0; i < 4; i++)
        {
            _evTime[i] = Theme.Lbl("--:--", 16f, Theme.Text, true);
            _evFuel[i] = Theme.Lbl("--", 10f, Theme.Accent);
            times.Controls.Add(Theme.Lbl(names[i], 8f, Theme.Muted, true), i, 0);
            times.Controls.Add(_evTime[i], i, 1);
            times.Controls.Add(_evFuel[i], i, 2);
        }
        times.Controls.Add(_summary, 0, 3);
        times.SetColumnSpan(_summary, 4);
        timesCard.Controls.Add(times);

        var plotCard = new Card("TOUCHDOWN PLOTTER") { Dock = DockStyle.Fill, Margin = new Padding(0) };
        plotCard.Controls.Add(_plotter);

        left.Controls.Add(flightCard, 0, 0);
        left.Controls.Add(timesCard, 0, 1);
        left.Controls.Add(plotCard, 0, 2);

        // ---- right column
        var right = Grid(1, 3);
        right.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        right.RowStyles.Add(new RowStyle(SizeType.Absolute, 184));
        right.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        right.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var landingCard = new Card("LANDING") { Dock = DockStyle.Fill };
        var landing = Grid(2, 4);
        landing.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
        landing.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 56));
        for (var i = 0; i < 4; i++) landing.RowStyles.Add(new RowStyle(SizeType.Percent, 25));
        landing.Controls.Add(_rate, 0, 0);
        landing.SetRowSpan(_rate, 2);
        landing.Controls.Add(_rating, 0, 2);
        landing.SetRowSpan(_rating, 2);
        landing.Controls.Add(_rwyLine, 1, 0);
        landing.Controls.Add(_distLine, 1, 1);
        landing.Controls.Add(_offLine, 1, 2);
        landing.Controls.Add(_gsLine, 1, 3);
        landingCard.Controls.Add(landing);

        var wpCard = new Card("WAYPOINTS  -  TIME, ALTITUDE AND FUEL LOGGED AUTOMATICALLY") { Dock = DockStyle.Fill, Margin = new Padding(0) };
        _wpList.Columns.Add("WAYPOINT", 120);
        _wpList.Columns.Add("TIME", 90);
        _wpList.Columns.Add("ALTITUDE", 100);
        _wpList.Columns.Add("FUEL", 110);
        wpCard.Controls.Add(_wpList);

        var done = Grid(3, 1);
        done.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        done.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        done.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
        done.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var donePdf = Theme.Btn("Save as PDF...", primary: true);
        var doneOpen = Theme.Btn("Open logbook");
        foreach (var b in new[] { donePdf, doneOpen })
        {
            b.Dock = DockStyle.Fill;
            b.Margin = new Padding(6, 4, 0, 4);
        }
        donePdf.Click += (_, _) => { if (_rec.LastCompleted is { } f) _ = ExportPdfAsync(f); };
        doneOpen.Click += (_, _) => SetView(live: false);
        done.Controls.Add(_doneText, 0, 0);
        done.Controls.Add(donePdf, 1, 0);
        done.Controls.Add(doneOpen, 2, 0);
        _doneCard.Margin = new Padding(0, 12, 0, 0);
        _doneCard.MinimumSize = new Size(0, 96);
        _doneCard.Controls.Add(done);

        right.Controls.Add(landingCard, 0, 0);
        right.Controls.Add(wpCard, 0, 1);
        right.Controls.Add(_doneCard, 0, 2);

        split.Controls.Add(left, 0, 0);
        split.Controls.Add(right, 1, 0);
        _livePanel.Controls.Add(split);
    }

    private void BuildLogbook()
    {
        var split = Grid(2, 1);
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60));
        split.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40));
        split.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var listCard = new Card("LOGBOOK") { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 12, 0) };
        _flightList.Columns.Add("DATE", 96);
        _flightList.Columns.Add("FLIGHT", 84);
        _flightList.Columns.Add("FROM", 58);
        _flightList.Columns.Add("TO", 58);
        _flightList.Columns.Add("AIRCRAFT", 150);
        _flightList.Columns.Add("BLOCK", 60);
        _flightList.Columns.Add("LANDING", 80);
        _flightList.Columns.Add("FUEL BURNED", 100);
        _flightList.SelectedIndexChanged += (_, _) => { if (!_suppress) ShowDetail(SelectedFlight()); };
        listCard.Controls.Add(_flightList);

        var detailCard = new Card("FLIGHT DETAILS") { Dock = DockStyle.Fill, Margin = new Padding(0) };
        var detail = Grid(1, 4);
        detail.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 236));
        detail.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        detail.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));

        _detailText.Font = new Font("Consolas", 9.5f);
        _detailPlot.SizeChanged += (_, _) => RenderDetailPlot();

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, BackColor = Color.Transparent, Padding = new Padding(0, 8, 0, 0) };
        _pdfBtn.Width = 150;
        _deleteBtn.Width = 90;
        _csvBtn.Width = 150;
        _pdfBtn.Click += (_, _) => { if (SelectedFlight() is { } f) _ = ExportPdfAsync(f); };
        _deleteBtn.Click += (_, _) => DeleteSelected();
        _csvBtn.Click += (_, _) => ExportCsv();
        buttons.Controls.AddRange([_pdfBtn, _deleteBtn, _csvBtn]);

        detail.Controls.Add(_detailTitle, 0, 0);
        detail.Controls.Add(_detailText, 0, 1);
        detail.Controls.Add(_detailPlot, 0, 2);
        detail.Controls.Add(buttons, 0, 3);
        detailCard.Controls.Add(detail);

        split.Controls.Add(listCard, 0, 0);
        split.Controls.Add(detailCard, 1, 0);
        _logPanel.Controls.Add(split);
    }

    private void BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open NAVDECK Logbook", null, (_, _) => ShowWindow());
        menu.Items.Add("Load SimBrief plan", null, (_, _) => _ = LoadSimBriefAsync(silent: false));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) =>
        {
            _reallyExit = true;
            Close();
        });

        _tray.Icon = Icon ?? SystemIcons.Application;
        _tray.Text = "NAVDECK Logbook";
        _tray.ContextMenuStrip = menu;
        _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowWindow();
        _tray.BalloonTipClicked += (_, _) => ShowWindow();
    }

    // ------------------------------------------------------------------ window behaviour

    protected override void SetVisibleCore(bool value)
    {
        // Started by Windows or FSUIPC: stay in the tray until the user opens the window.
        base.SetVisibleCore(_startHidden ? false : value);
    }

    private void ShowWindow()
    {
        _startHidden = false;
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!_reallyExit && e.CloseReason == CloseReason.UserClosing)
        {
            // Closing the window keeps the recorder running so no flight is lost.
            e.Cancel = true;
            Hide();
            if (!_settings.TrayHintShown)
            {
                _tray.ShowBalloonTip(5000, "NAVDECK Logbook is still running",
                    "It keeps recording your flights from the system tray. Right-click the icon to exit.", ToolTipIcon.Info);
                _settings.TrayHintShown = true;
                SaveSettings();
            }
            return;
        }

        _cts.Cancel();
        _tray.Visible = false;
        _tray.Dispose();
        base.OnFormClosing(e);
    }

    private void Post(Action action)
    {
        try
        {
            if (IsHandleCreated && !IsDisposed) BeginInvoke(action);
        }
        catch (InvalidOperationException)
        {
            // The window is closing.
        }
    }

    private void SetView(bool live)
    {
        _livePanel.Visible = live;
        _logPanel.Visible = !live;
        Style(_navLive, live);
        Style(_navLog, !live);
        if (!live) ShowDetail(SelectedFlight());

        static void Style(Button b, bool active)
        {
            b.BackColor = active ? Theme.AccentDim : Theme.Card;
            b.ForeColor = active ? Theme.Accent : Theme.Muted;
        }
    }

    private void SetEvent(string text) => Theme.SetText(_event, text);

    private void SaveSettings()
    {
        try { _store.SaveSettings(_settings); } catch (Exception) { }
    }

    // ------------------------------------------------------------------ simulator connection (background thread)

    private void PollLoop()
    {
        using var link = new FsuipcLink();
        var token = _cts.Token;
        var wasOpen = false;

        while (!token.IsCancellationRequested)
        {
            if (!link.IsOpen)
            {
                if (wasOpen)
                {
                    wasOpen = false;
                    Post(() => SetConnected(false));
                }
                if (!link.TryOpen())
                {
                    token.WaitHandle.WaitOne(2500);
                    continue;
                }
                wasOpen = true;
                Post(() => SetConnected(true));
            }

            if (link.Read() is not { } sample)
                continue;   // connection dropped; reconnect on the next pass

            var title = link.AircraftTitle;
            Post(() => OnSample(sample, title));

            // Sample faster close to the ground so the touchdown point is precise.
            var nearGround = !sample.OnGround && double.IsFinite(sample.RadioAltFt) && sample.RadioAltFt < 400;
            token.WaitHandle.WaitOne(nearGround ? 100 : 250);
        }
    }

    private void SetConnected(bool connected)
    {
        _connected = connected;
        _status.ForeColor = connected ? Theme.Good : Theme.Warn;
        Theme.SetText(_status, connected ? "●  Simulator connected" : "●  Waiting for simulator (FSUIPC7)");
        if (!connected)
        {
            _last = null;
            Theme.SetText(_telemetry, "Start the simulator with FSUIPC7 running. The logbook connects by itself.");
        }
    }

    private void OnSample(Sample s, string title)
    {
        _last = s;
        _rec.Feed(s, DateTime.UtcNow, title);
        UpdateTelemetry(s);
        UpdateSummary(_rec.Shown);
    }

    // ------------------------------------------------------------------ live view

    private void UpdateTelemetry(Sample s)
    {
        if (!s.HasPosition)
        {
            Theme.SetText(_telemetry, "Connected. Waiting for the aircraft to load...");
            return;
        }
        var text = $"ALT {s.AltFt:N0} ft     GS {s.GroundSpeedKt:N0} kt     FUEL {Fmt.Fuel(s.FuelLb, _settings.UseKg)}";
        if (!s.OnGround && double.IsFinite(s.VerticalSpeedFpm)) text += $"     V/S {s.VerticalSpeedFpm:N0} fpm";
        if (_rec.Stage == Stage.Airborne && _rec.NextFix is { } next)
            text += $"     NEXT {next.Ident}" + (_rec.DistanceToNextNm is { } nm ? $" {nm:0} nm" : "");
        Theme.SetText(_telemetry, text);
    }

    private void UpdateSummary(FlightRecord f)
    {
        var now = DateTime.UtcNow;
        var block = f.BlockTime ?? (f.GateOutUtc is { } o && f.GateInUtc is null ? now - o : (TimeSpan?)null);
        var air = f.AirTime ?? (f.TakeoffUtc is { } t && f.LandingUtc is null ? now - t : (TimeSpan?)null);
        var burned = f.FuelBurnedLb;
        if (burned is null && f.GateInUtc is null && f.FuelGateOutLb is { } start && _last is { FuelLb: > 0 } cur && start >= cur.FuelLb)
            burned = start - cur.FuelLb;

        Theme.SetText(_summary,
            $"Block {Fmt.Duration(block)}      Air {Fmt.Duration(air)}      Fuel burned {Fmt.Fuel(burned, _settings.UseKg)}" +
            (f.MaxAltitudeFt > 0 ? $"      Max alt {f.MaxAltitudeFt:N0} ft" : ""));
    }

    private void RefreshLive()
    {
        var f = _rec.Shown;
        var kg = _settings.UseKg;
        var completed = _rec.Stage == Stage.Parked && _rec.LastCompleted is not null;

        var dep = string.IsNullOrWhiteSpace(f.Origin) ? "----" : f.Origin;
        var arr = string.IsNullOrWhiteSpace(f.Destination) ? "----" : f.Destination;
        Theme.SetText(_route, $"{dep}  →  {arr}");
        Theme.SetText(_sub, string.IsNullOrWhiteSpace(f.Aircraft) ? "Aircraft detected when the simulator connects" : f.Aircraft);

        if (!_callsign.Focused && _callsign.Text != f.Callsign)
        {
            _suppress = true;
            _callsign.Text = f.Callsign;
            _suppress = false;
        }
        _simbriefBtn.Visible = !string.IsNullOrWhiteSpace(_settings.SimBriefUser);
        _simbriefBtn.Enabled = _rec.Stage is Stage.Parked or Stage.TaxiOut;

        _phase.Progress = completed ? 4 : (int)_rec.Stage;

        var times = new[] { f.GateOutUtc, f.TakeoffUtc, f.LandingUtc, f.GateInUtc };
        var fuels = new[] { f.FuelGateOutLb, f.FuelTakeoffLb, f.FuelLandingLb, f.FuelGateInLb };
        for (var i = 0; i < 4; i++)
        {
            Theme.SetText(_evTime[i], Fmt.ShortTime(times[i]));
            Theme.SetText(_evFuel[i], Fmt.Fuel(fuels[i], kg));
        }
        UpdateSummary(f);

        // landing
        Theme.SetText(_rate, f.LandingRateFpm is { } r ? $"{r:N0} fpm" : "--");
        _rate.ForeColor = f.LandingRateFpm switch
        {
            null => Theme.Muted,
            < 250 => Theme.Good,
            < 600 => Theme.Warn,
            _ => Theme.Bad,
        };
        Theme.SetText(_rating, f.LandingRateFpm is null ? "Landing rate appears at touchdown" : Fmt.RateRating(f.LandingRateFpm));
        Theme.SetText(_rwyLine, f.LandingRunway.Length > 0 ? $"Runway {f.LandingRunway}  {f.LandingAirport}" : "Runway  --");
        Theme.SetText(_distLine, $"From threshold  {Fmt.Feet(f.TouchdownDistanceFt)}");
        Theme.SetText(_offLine, $"Centreline  {Fmt.Lateral(f.TouchdownOffsetFt)}");
        Theme.SetText(_gsLine, "Touchdown G/S  " + (f.TouchdownGroundSpeedKt is { } gs ? $"{gs} kt" : "--") +
                               (f.GoArounds > 0 ? $"     Go-arounds {f.GoArounds}" : ""));
        _plotter.SetFlight(f);

        // waypoints
        var key = $"{f.Id}|{f.Waypoints.Count}|{kg}";
        if (key != _wpKey)
        {
            _wpKey = key;
            _wpList.BeginUpdate();
            _wpList.Items.Clear();
            foreach (var w in f.Waypoints)
                _wpList.Items.Add(new ListViewItem(new[]
                {
                    w.Ident, Fmt.ShortTime(w.TimeUtc), $"{w.AltFt:N0} ft", Fmt.Fuel(w.FuelLb, kg),
                }));
            _wpList.EndUpdate();
            if (_wpList.Items.Count > 0) _wpList.EnsureVisible(_wpList.Items.Count - 1);
        }

        // completion banner
        if (_doneCard.Visible != completed) _doneCard.Visible = completed;
        if (completed)
            Theme.SetText(_doneText, $"{f.RouteText}   block {Fmt.Duration(f.BlockTime)}   {Fmt.RateText(f.LandingRateFpm)}");
    }

    private void OnCallsignEdited()
    {
        if (_suppress) return;
        var text = _callsign.Text.Trim();
        var shown = _rec.Shown;
        shown.Callsign = text;
        _rec.Current.Callsign = text;
        if (ReferenceEquals(shown, _rec.LastCompleted))
        {
            try { _store.Save(shown); } catch (Exception) { }
            FillFlightList(SelectedFlight());
        }
    }

    // ------------------------------------------------------------------ flight finished

    private void OnFlightCompleted(FlightRecord f)
    {
        try
        {
            _store.Save(f);
        }
        catch (Exception ex)
        {
            SetEvent("The flight could not be saved: " + ex.Message);
        }

        _flights.Insert(0, f);
        FillFlightList(f);

        if (!Visible)
            _tray.ShowBalloonTip(6000, "Flight logged: " + f.RouteText,
                $"Block {Fmt.Duration(f.BlockTime)}, landing rate {Fmt.RateText(f.LandingRateFpm)}. Click to open the logbook.",
                ToolTipIcon.Info);

        if (_settings.PromptForPdf) Post(() => PromptForPdf(f));
    }

    private void PromptForPdf(FlightRecord f)
    {
        // A tiny top-most owner keeps the question above the simulator window.
        using var owner = new Form
        {
            TopMost = true,
            ShowInTaskbar = false,
            FormBorderStyle = FormBorderStyle.None,
            StartPosition = FormStartPosition.Manual,
            Location = new Point(-10000, -10000),
            Size = new Size(1, 1),
        };
        owner.Show();
        var answer = MessageBox.Show(owner,
            $"Flight logged: {f.RouteText}\n" +
            $"Block {Fmt.Duration(f.BlockTime)}    Landing rate {Fmt.RateText(f.LandingRateFpm)}\n\n" +
            "Save a PDF flight report now?",
            "NAVDECK Logbook - flight complete", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        owner.Close();
        if (answer == DialogResult.Yes) _ = ExportPdfAsync(f);
    }

    private async Task ExportPdfAsync(FlightRecord f)
    {
        try
        {
            string path;
            using (var dialog = new SaveFileDialog
            {
                Title = "Save flight report as PDF",
                Filter = "PDF document (*.pdf)|*.pdf",
                DefaultExt = "pdf",
                OverwritePrompt = true,
                FileName = Fmt.FileSafe($"NAVDECK {f.RouteText} {(f.StartUtc ?? DateTime.UtcNow):yyyy-MM-dd}") + ".pdf",
                InitialDirectory = Directory.Exists(_settings.PdfFolder)
                    ? _settings.PdfFolder
                    : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            })
            {
                var result = Visible ? dialog.ShowDialog(this) : dialog.ShowDialog();
                if (result != DialogResult.OK) return;
                path = dialog.FileName;
            }

            _settings.PdfFolder = Path.GetDirectoryName(path) ?? "";
            SaveSettings();

            var kg = _settings.UseKg;
            SetEvent("Creating PDF...");
            await Task.Run(() => PdfExporter.Export(f, path, kg));
            SetEvent("PDF saved: " + path);

            if (MessageBox.Show("The PDF was saved.\n\nOpen it now?", "NAVDECK Logbook",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            SetEvent("PDF export failed.");
            MessageBox.Show("The PDF could not be created:\n" + ex.Message, "NAVDECK Logbook",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    // ------------------------------------------------------------------ logbook view

    private FlightRecord? SelectedFlight() =>
        _flightList.SelectedItems.Count > 0 ? _flightList.SelectedItems[0].Tag as FlightRecord : null;

    private void FillFlightList(FlightRecord? select)
    {
        var kg = _settings.UseKg;
        _suppress = true;
        _flightList.BeginUpdate();
        try
        {
            _flightList.Items.Clear();
            foreach (var f in _flights)
            {
                var item = new ListViewItem(new[]
                {
                    Fmt.Date(f.StartUtc),
                    string.IsNullOrWhiteSpace(f.Callsign) ? "-" : f.Callsign,
                    f.Origin, f.Destination, f.Aircraft,
                    Fmt.Duration(f.BlockTime),
                    f.LandingRateFpm is { } r ? $"{r:N0} fpm" : "-",
                    Fmt.Fuel(f.FuelBurnedLb, kg),
                })
                { Tag = f };
                _flightList.Items.Add(item);
                if (select is not null && f.Id == select.Id) item.Selected = true;
            }
        }
        finally
        {
            _flightList.EndUpdate();
            _suppress = false;
        }
        ShowDetail(SelectedFlight());
    }

    private void ShowDetail(FlightRecord? f)
    {
        _detailFlight = f;
        _pdfBtn.Enabled = _deleteBtn.Enabled = f is not null;
        _csvBtn.Enabled = _flights.Count > 0;

        if (f is null)
        {
            Theme.SetText(_detailTitle, _flights.Count == 0 ? "No flights yet" : "Select a flight");
            Theme.SetText(_detailText, _flights.Count == 0
                ? "Fly a flight and it appears here automatically."
                : "");
            RenderDetailPlot();
            return;
        }

        var kg = _settings.UseKg;
        static string Row(string k, string v) => $"{k,-13}{v}\n";
        Theme.SetText(_detailTitle, $"{f.RouteText.Replace(" - ", "  →  ")}");
        Theme.SetText(_detailText,
            Row("Date", Fmt.Date(f.StartUtc)) +
            Row("Flight", string.IsNullOrWhiteSpace(f.Callsign) ? "-" : f.Callsign) +
            Row("Aircraft", f.Aircraft) +
            Row("Gate out", $"{Fmt.Time(f.GateOutUtc),-11}{Fmt.Fuel(f.FuelGateOutLb, kg)}") +
            Row("Take-off", $"{Fmt.Time(f.TakeoffUtc),-11}{Fmt.Fuel(f.FuelTakeoffLb, kg)}") +
            Row("Landing", $"{Fmt.Time(f.LandingUtc),-11}{Fmt.Fuel(f.FuelLandingLb, kg)}") +
            Row("Gate in", $"{Fmt.Time(f.GateInUtc),-11}{Fmt.Fuel(f.FuelGateInLb, kg)}") +
            Row("Block / air", $"{Fmt.Duration(f.BlockTime)} / {Fmt.Duration(f.AirTime)}") +
            Row("Fuel burned", Fmt.Fuel(f.FuelBurnedLb, kg)) +
            Row("Landing", $"{Fmt.RateText(f.LandingRateFpm)}  {Fmt.RateRating(f.LandingRateFpm)}") +
            Row("Runway", f.LandingRunway.Length > 0 ? $"{f.LandingRunway} {f.LandingAirport}" : "-") +
            Row("Touchdown", f.HasTouchdownPlot ? $"{Fmt.Feet(f.TouchdownDistanceFt)}, {Fmt.Lateral(f.TouchdownOffsetFt)}" : "-") +
            Row("Max alt", f.MaxAltitudeFt > 0 ? $"{f.MaxAltitudeFt:N0} ft" : "-") +
            Row("Waypoints", f.Waypoints.Count.ToString()));
        RenderDetailPlot();
    }

    private void RenderDetailPlot()
    {
        var old = _detailPlot.Image;
        _detailPlot.Image = _detailFlight is not null && _detailPlot.Width > 60 && _detailPlot.Height > 50 && _logPanel.Visible
            ? Plots.TouchdownPlot(_detailFlight, _detailPlot.Width, _detailPlot.Height, PlotTheme.Dark)
            : null;
        old?.Dispose();
    }

    private void DeleteSelected()
    {
        if (SelectedFlight() is not { } f) return;
        if (MessageBox.Show(this, $"Delete the flight {f.RouteText} on {Fmt.Date(f.StartUtc)} from the logbook?\nThis cannot be undone.",
                "NAVDECK Logbook", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
        _store.Delete(f);
        _flights.Remove(f);
        FillFlightList(null);
    }

    private void ExportCsv()
    {
        using var dialog = new SaveFileDialog
        {
            Title = "Export the logbook",
            Filter = "CSV spreadsheet (*.csv)|*.csv",
            DefaultExt = "csv",
            FileName = "NAVDECK logbook.csv",
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            File.WriteAllText(dialog.FileName, LogbookStore.ToCsv(_flights, _settings.UseKg));
            SetEvent("Logbook exported: " + dialog.FileName);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "The logbook could not be exported:\n" + ex.Message, "NAVDECK Logbook",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    // ------------------------------------------------------------------ settings and SimBrief

    private void OpenSettings()
    {
        using var dialog = new SettingsForm(_settings);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;

        var userChanged = dialog.Result.SimBriefUser != _settings.SimBriefUser;
        _settings = dialog.Result;
        SaveSettings();
        _wpKey = "";
        RefreshLive();
        FillFlightList(SelectedFlight());
        if (_last is { } s) UpdateTelemetry(s);
        if (userChanged && !string.IsNullOrWhiteSpace(_settings.SimBriefUser))
            _ = LoadSimBriefAsync(silent: false);
    }

    private async Task LoadSimBriefAsync(bool silent)
    {
        var user = _settings.SimBriefUser.Trim();
        if (user.Length == 0)
        {
            if (!silent) SetEvent("Add your SimBrief username in Settings first.");
            return;
        }
        try
        {
            if (!silent) SetEvent("Loading the latest SimBrief plan...");
            var ofp = await SimBrief.FetchAsync(user, _cts.Token);
            if (IsDisposed) return;
            _rec.ApplyFlightPlan(ofp);
        }
        catch (Exception ex)
        {
            SetEvent("SimBrief plan not loaded: " + ex.Message);
        }
    }
}
