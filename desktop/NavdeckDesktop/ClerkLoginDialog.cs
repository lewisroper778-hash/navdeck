using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.WinForms;

namespace NavdeckLink;

// Clerk sign-in stays in a dedicated, visible WebView2 window. The website
// authenticates the user and exchanges a verified Clerk session with the
// existing NAVDECK backend for a revocable desktop credential. The desktop
// never sees passwords or Clerk JWTs; no connection code is copied by users.
internal sealed class ClerkLoginDialog : Form
{
    private const string FrontendOrigin = "https://navdeck-frontend.onrender.com";
    private const string HandoffPath = "/desktop/connect";
    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly Label _status = new()
    {
        Text = "Loading secure NAVDECK sign-in…",
        Dock = DockStyle.Bottom,
        Height = 35,
        Padding = new Padding(15, 8, 0, 0),
        ForeColor = Color.FromArgb(193, 202, 221),
        BackColor = Color.FromArgb(21, 25, 36),
        AutoSize = false
    };

    public string? DesktopToken { get; private set; }

    public ClerkLoginDialog()
    {
        Text = "Sign in to NAVDECK";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(1030, 740);
        MinimumSize = new Size(750, 540);
        BackColor = Color.FromArgb(13, 18, 30);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var cancel = new Button
        {
            Text = "Cancel",
            Dock = DockStyle.Right,
            Width = 112,
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(53, 61, 83)
        };
        cancel.FlatAppearance.BorderSize = 0;
        cancel.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };
        var reload = new Button
        {
            Text = "Retry sign-in",
            Dock = DockStyle.Right,
            Width = 125,
            FlatStyle = FlatStyle.Flat,
            ForeColor = Color.White,
            BackColor = Color.FromArgb(38, 91, 139)
        };
        reload.FlatAppearance.BorderSize = 0;
        reload.Click += (_, _) =>
        {
            if (_web.CoreWebView2 is null) return;
            _status.Text = "Retrying NAVDECK sign-in…";
            _web.CoreWebView2.Navigate(FrontendOrigin + HandoffPath);
        };
        var top = new Panel { Dock = DockStyle.Top, Height = 43, BackColor = Color.FromArgb(21, 25, 36) };
        var heading = new Label
        {
            Text = "  NAVDECK  /  SECURE ACCOUNT SIGN-IN",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10, FontStyle.Bold)
        };
        top.Controls.Add(heading);
        top.Controls.Add(reload);
        top.Controls.Add(cancel);
        Controls.Add(_web);
        Controls.Add(_status);
        Controls.Add(top);

        Shown += async (_, _) =>
        {
            try
            {
                await _web.EnsureCoreWebView2Async();
                _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
                _web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
                _web.CoreWebView2.NavigationCompleted += (_, args) =>
                {
                    if (!args.IsSuccess)
                        _status.Text = "Sign-in page couldn't load (" +
                            args.WebErrorStatus + "). Check your connection and select Retry sign-in.";
                };
                _web.CoreWebView2.NavigationStarting += (_, args) =>
                {
                    // The sign-in widget can redirect to Clerk / identity
                    // providers, but no file, javascript or HTTP pages.
                    if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var url) ||
                        url.Scheme != Uri.UriSchemeHttps)
                        args.Cancel = true;
                };
                _web.CoreWebView2.WebMessageReceived += (_, args) =>
                {
                    // Only our authenticated handoff route may provide a
                    // desktop credential, never an external identity page.
                    if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) ||
                        source.GetLeftPart(UriPartial.Authority) != FrontendOrigin ||
                        source.AbsolutePath != HandoffPath)
                        return;
                    try
                    {
                        using var json = JsonDocument.Parse(args.WebMessageAsJson);
                        var root = json.RootElement;
                        if (!root.TryGetProperty("type", out var kind) ||
                            kind.GetString() != "navdeck:clerk-connected" ||
                            !root.TryGetProperty("token", out var token) ||
                            token.ValueKind != JsonValueKind.String)
                            return;
                        var value = token.GetString();
                        if (value is null || !Regex.IsMatch(value, @"^[A-Za-z0-9_-]{30,80}$"))
                            return;
                        DesktopToken = value;
                        DialogResult = DialogResult.OK;
                        Close();
                    }
                    catch (JsonException) { }
                };
                _web.CoreWebView2.Navigate(FrontendOrigin + HandoffPath);
                _status.Text = "Sign in with Clerk, then choose Connect this Windows app.";
            }
            catch (Exception error)
            {
                _status.Text = "Could not open sign-in: " + error.Message;
            }
        };
    }
}
