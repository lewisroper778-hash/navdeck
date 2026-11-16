using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NavdeckEfb;

// The Windows window: shows the EFB pages, keeps running in the tray, and turns the journey log into a PDF.
internal sealed class MainForm : Form
{
    private readonly Store _store;
    private readonly EfbServer _server;
    private readonly WebView2 _view = new() { Dock = DockStyle.Fill };
    private readonly WebView2 _printView = new() { Size = new Size(820, 1160), Location = new Point(-4000, 0), TabStop = false };
    private readonly Label _status = new()
    {
        Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(154, 154, 168),
        Font = new Font("Segoe UI", 11f), Text = "Starting NAVDECK EFB...",
    };
    private readonly NotifyIcon _tray = new();
    private readonly SemaphoreSlim _pdfLock = new(1, 1);
    private Task<CoreWebView2Environment>? _environment;
    private bool _startHidden, _reallyExit, _printReady, _trayHintShown;

    public MainForm(Store store, EfbServer server, bool startHidden)
    {
        _store = store;
        _server = server;
        _startHidden = startHidden;

        Text = "NAVDECK EFB";
        ClientSize = new Size(1280, 820);
        MinimumSize = new Size(900, 640);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(20, 20, 24);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

        Controls.Add(_view);
        Controls.Add(_printView);
        Controls.Add(_status);
        _status.BringToFront();
        BuildTray();
        CreateHandle();

        _server.PdfRenderer = RenderPdfAsync;
        _ = InitialiseAsync();
    }

    private Task<CoreWebView2Environment> GetEnvironment()
    {
        return _environment ??= CoreWebView2Environment.CreateAsync(null, Path.Combine(_store.DataDir, "WebView2"));
    }

    private async Task InitialiseAsync()
    {
        try
        {
            await _view.EnsureCoreWebView2Async(await GetEnvironment());
            _view.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _view.CoreWebView2.NavigationCompleted += (_, _) => _status.Visible = false;
            _view.CoreWebView2.Navigate($"http://127.0.0.1:{_server.Port}/");
        }
        catch (Exception ex)
        {
            _status.Text = "NAVDECK EFB is running, but the built-in window could not start.\n" +
                           $"Open http://127.0.0.1:{_server.Port} in your browser instead.\n\n" + ex.Message;
        }
    }

    // ---------------------------------------------------------------- PDF export (called from the web server)

    public Task<byte[]> RenderPdfAsync(string flightId)
    {
        if (!IsHandleCreated || IsDisposed) throw new InvalidOperationException("The app is closing.");
        if (InvokeRequired) return (Task<byte[]>)Invoke(new Func<Task<byte[]>>(() => RenderPdfOnUiAsync(flightId)));
        return RenderPdfOnUiAsync(flightId);
    }

    private async Task<byte[]> RenderPdfOnUiAsync(string flightId)
    {
        await _pdfLock.WaitAsync();
        var file = Path.Combine(Path.GetTempPath(), "navdeck-efb-" + Guid.NewGuid().ToString("N") + ".pdf");
        try
        {
            if (!_printReady)
            {
                await _printView.EnsureCoreWebView2Async(await GetEnvironment());
                _printReady = true;
            }
            var core = _printView.CoreWebView2;
            var ready = new TaskCompletionSource<bool>();
            void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
            {
                try { if (e.TryGetWebMessageAsString() == "report-ready") ready.TrySetResult(true); } catch (Exception) { }
            }
            core.WebMessageReceived += OnMessage;
            try
            {
                core.Navigate($"http://127.0.0.1:{_server.Port}/report.html?embed=1&id={Uri.EscapeDataString(flightId)}&t={DateTime.UtcNow.Ticks}");
                await Task.WhenAny(ready.Task, Task.Delay(15000));
            }
            finally
            {
                core.WebMessageReceived -= OnMessage;
            }
            await Task.Delay(350);     // let the touchdown plot and signatures paint

            var settings = core.Environment.CreatePrintSettings();
            settings.ShouldPrintBackgrounds = true;
            settings.ShouldPrintHeaderAndFooter = false;
            settings.MarginTop = settings.MarginBottom = settings.MarginLeft = settings.MarginRight = 0;
            settings.PageWidth = 8.27;      // A4 in inches
            settings.PageHeight = 11.69;
            if (!await core.PrintToPdfAsync(file, settings))
                throw new InvalidOperationException("The PDF could not be created.");
            return await File.ReadAllBytesAsync(file);
        }
        finally
        {
            try { File.Delete(file); } catch (Exception) { }
            _pdfLock.Release();
        }
    }

    // ---------------------------------------------------------------- window and tray behaviour

    private void BuildTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open NAVDECK EFB", null, (_, _) => ShowWindow());
        menu.Items.Add("Copy tablet address", null, (_, _) =>
        {
            var url = _server.LanUrls().FirstOrDefault();
            if (url is null) return;
            try { Clipboard.SetText(url); } catch (Exception) { }
            _tray.ShowBalloonTip(4000, "Tablet address copied", url + "\nOpen it in Safari on the same Wi-Fi.", ToolTipIcon.Info);
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) =>
        {
            _reallyExit = true;
            Close();
        });
        _tray.Icon = Icon ?? SystemIcons.Application;
        _tray.Text = "NAVDECK EFB";
        _tray.ContextMenuStrip = menu;
        _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowWindow();
    }

    protected override void SetVisibleCore(bool value) => base.SetVisibleCore(_startHidden ? false : value);

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
            // Keep recording the flight and serving the tablets while the window is closed.
            e.Cancel = true;
            Hide();
            if (!_trayHintShown)
            {
                _trayHintShown = true;
                _tray.ShowBalloonTip(5000, "NAVDECK EFB is still running",
                    "It keeps recording your flight and serving your tablets. Right-click the tray icon to exit.", ToolTipIcon.Info);
            }
            return;
        }
        _tray.Visible = false;
        _tray.Dispose();
        base.OnFormClosing(e);
    }
}
