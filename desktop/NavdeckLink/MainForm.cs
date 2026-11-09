namespace NavdeckLink;

internal sealed class MainForm : Form
{
    private readonly Config _config = Config.Load();
    private readonly FsuipcLink _sim = new();
    private readonly FlightTracker _tracker = new();
    private readonly System.Windows.Forms.Timer _poll = new() { Interval = 100 };
    private readonly System.Windows.Forms.Timer _slow = new() { Interval = 5000 };
    private readonly bool _startMinimized;
    private NavdeckApi? _api;
    private DateTime _lastBeat = DateTime.MinValue;
    private bool _testFlight;

    private readonly Label _simStatus = Theme.Label("Waiting for FSUIPC7…", 10, Theme.Amber, true);
    private readonly Label _navStatus = Theme.Label("Not connected to NAVDECK", 10, Theme.Amber, true);
    private readonly Label _stage = Theme.Label("Parked", 18, bold: true);
    private readonly Label _times = Theme.Label("", 10.5f);
    private readonly ListBox _log = new() { Width = 470, Height = 150, BackColor = Theme.Card, ForeColor = Theme.Muted, BorderStyle = BorderStyle.None, Font = new Font("Consolas", 9f) };
    private readonly Button _startup;

    public MainForm(bool startMinimized)
    {
        _startMinimized = startMinimized;
        Text = "NAVDECK Link";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Theme.Bg;
        ForeColor = Theme.Text;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(20);
        StartPosition = FormStartPosition.CenterScreen;

        _startup = Theme.Button("Open with simulator", Theme.Line, (_, _) => ToggleStartup());
        var buttons = new FlowLayoutPanel { AutoSize = true, BackColor = Theme.Bg, Margin = new Padding(0, 8, 0, 0) };
        buttons.Controls.Add(Theme.Button("Connection code", Theme.Accent, (_, _) => AskCode()));
        buttons.Controls.Add(_startup);
        buttons.Controls.Add(Theme.Button("Test flight", Theme.Line, (_, _) => RunTestFlight()));
        buttons.Controls.Add(Theme.Button("New flight", Theme.Line, (_, _) => { _tracker.Reset(); Log("Ready for a new flight"); RefreshView(); }));

        var layout = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, BackColor = Theme.Bg, WrapContents = false };
        layout.Controls.Add(Theme.Label("NAVDECK LINK", 9, Theme.Accent, true));
        layout.Controls.Add(Theme.Label("Fills your NAVDECK flight from the sim", 13, bold: true));
        layout.Controls.Add(_simStatus);
        layout.Controls.Add(_navStatus);
        layout.Controls.Add(Theme.Label("PHASE", 8, Theme.Muted, true));
        layout.Controls.Add(_stage);
        layout.Controls.Add(_times);
        layout.Controls.Add(buttons);
        layout.Controls.Add(Theme.Label("ACTIVITY", 8, Theme.Muted, true));
        layout.Controls.Add(_log);
        Controls.Add(layout);

        _poll.Tick += (_, _) => Poll();
        _slow.Tick += async (_, _) => await SlowTick();
        Shown += async (_, _) => await Start();
        FormClosing += async (_, _) => await Shutdown();
    }

    private async Task Start()
    {
        if (_startMinimized) WindowState = FormWindowState.Minimized;
        if (!Config.IsValidCode(_config.Code)) AskCode();
        else await Connect();
        UpdateStartupButton();
        RefreshView();
        _poll.Start();
        _slow.Start();
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
            SetStatus(_simStatus, "Sim disconnected · waiting for FSUIPC7…", Theme.Amber);
            return;
        }
        OnSimEvent(_tracker.Update(s, DateTime.UtcNow));
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
        RefreshView();
    }

    private async void OnSimEvent(SimEvent? e)
    {
        if (e is null) return;
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
        if (_api is not null)
        {
            try { await _api.HeartbeatAsync(_sim.AircraftTitle, false).WaitAsync(TimeSpan.FromSeconds(2)); }
            catch (Exception) { }
        }
        _sim.Dispose();
    }
}
