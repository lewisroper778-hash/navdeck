namespace NavdeckEfb;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Headless check used by the automated build.
        var test = Array.FindIndex(args, a => a.Equals("--selftest", StringComparison.OrdinalIgnoreCase));
        if (test >= 0)
        {
            var dir = test + 1 < args.Length ? args[test + 1] : Path.Combine(Path.GetTempPath(), "navdeck-efb-selftest");
            return SelfTest.Run(dir);
        }

        using var single = new Mutex(true, "NavdeckEFB.SingleInstance", out var first);
        if (!first)
        {
            MessageBox.Show("NAVDECK EFB is already running. Look for its icon in the system tray.",
                "NAVDECK EFB", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        ApplicationConfiguration.Initialize();
        using var store = new Store();
        var runways = Task.Run(() => RunwayDb.LoadEmbedded());   // loads in the background; only needed at touchdown
        var engine = new FlightEngine(store, runways);
        var server = new EfbServer(store, engine);
        try
        {
            server.StartAsync().GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            MessageBox.Show("NAVDECK EFB could not start its local server:\n" + ex.Message,
                "NAVDECK EFB", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        using var poller = new SimPoller(engine);
        poller.Start();
        using var outbox = new ReportOutbox(store);
        server.Outbox = outbox;
        var hidden = args.Any(a => a.Equals("--minimized", StringComparison.OrdinalIgnoreCase));
        var form = new MainForm(store, server, hidden);
        outbox.PdfRenderer = form.RenderPdfAsync;
        outbox.Start();
        Application.Run(form);

        poller.Dispose();
        server.DisposeAsync().AsTask().Wait(3000);
        return 0;
    }
}

// Reads the simulator through FSUIPC7 on its own thread, reconnecting by itself.
internal sealed class SimPoller : IDisposable
{
    private readonly FlightEngine _engine;
    private readonly CancellationTokenSource _cts = new();
    private Thread? _thread;

    public SimPoller(FlightEngine engine) => _engine = engine;

    public void Start()
    {
        _thread = new Thread(Loop) { IsBackground = true, Name = "FSUIPC" };
        _thread.Start();
    }

    private void Loop()
    {
        using var link = new FsuipcLink();
        var token = _cts.Token;
        var wasOpen = false;
        while (!token.IsCancellationRequested)
        {
            try
            {
                if (!link.IsOpen)
                {
                    if (wasOpen)
                    {
                        wasOpen = false;
                        _engine.Disconnected();
                    }
                    if (!link.TryOpen())
                    {
                        token.WaitHandle.WaitOne(2500);
                        continue;
                    }
                    wasOpen = true;
                }

                if (link.Read() is not { } sample) continue;
                _engine.Feed(sample, DateTime.UtcNow, link.SimUtc, link.AircraftTitle);

                // Faster sampling near the ground so the touchdown point is precise.
                var nearGround = !sample.OnGround && double.IsFinite(sample.AglFt) && sample.AglFt < 400;
                token.WaitHandle.WaitOne(nearGround ? 100 : 250);
            }
            catch (Exception)
            {
                token.WaitHandle.WaitOne(1000);
            }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _thread?.Join(1500);
    }
}
