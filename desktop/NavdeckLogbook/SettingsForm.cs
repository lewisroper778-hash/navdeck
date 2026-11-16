using Microsoft.Win32;

namespace NavdeckLogbook;

internal sealed class SettingsForm : Form
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunName = "NAVDECK Logbook";

    private readonly RadioButton _lb = new() { Text = "Pounds (lb)", AutoSize = true };
    private readonly RadioButton _kg = new() { Text = "Kilograms (kg)", AutoSize = true };
    private readonly TextBox _simbrief = new();
    private readonly CheckBox _prompt = new() { Text = "Offer to save a PDF flight report when a flight ends", AutoSize = true };
    private readonly CheckBox _fsuipc = new() { Text = "Open the logbook automatically when FSUIPC7 starts", AutoSize = true };
    private readonly CheckBox _windows = new() { Text = "Start with Windows (minimised to the system tray)", AutoSize = true };
    private readonly string? _fsuipcIni = Fsuipc7Setup.FindIni();

    public AppSettings Result { get; private set; }

    public SettingsForm(AppSettings current)
    {
        Result = current;
        Text = "NAVDECK Logbook - Settings";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(520, 470);
        BackColor = Theme.Bg;
        ForeColor = Theme.Text;
        Font = Theme.Ui(9.5f);

        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            Padding = new Padding(22, 18, 22, 18),
            BackColor = Theme.Bg,
        };

        Control Heading(string text) => new Label
        {
            Text = text,
            AutoSize = true,
            Font = Theme.Ui(8f, true),
            ForeColor = Theme.Muted,
            Margin = new Padding(0, 12, 0, 4),
        };

        Control Hint(string text) => new Label
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(470, 0),
            ForeColor = Theme.Muted,
            Margin = new Padding(0, 2, 0, 0),
        };

        foreach (var radio in new[] { _lb, _kg }) radio.ForeColor = Theme.Text;
        foreach (var box in new[] { _prompt, _fsuipc, _windows })
        {
            box.ForeColor = Theme.Text;
            box.Margin = new Padding(0, 4, 0, 4);
        }

        _lb.Checked = !current.UseKg;
        _kg.Checked = current.UseKg;
        _prompt.Checked = current.PromptForPdf;

        _simbrief.Text = current.SimBriefUser;
        _simbrief.PlaceholderText = "SimBrief username or pilot ID";
        _simbrief.BackColor = Theme.Card;
        _simbrief.ForeColor = Theme.Text;
        _simbrief.BorderStyle = BorderStyle.FixedSingle;
        _simbrief.Width = 340;

        var fuelRow = new FlowLayoutPanel { AutoSize = true, BackColor = Theme.Bg, Margin = new Padding(0) };
        fuelRow.Controls.AddRange([_lb, _kg]);

        panel.Controls.Add(Heading("FUEL UNITS"));
        panel.Controls.Add(fuelRow);
        panel.Controls.Add(Hint("Fuel is always read from the simulator in pounds and converted for display and the PDF."));

        panel.Controls.Add(Heading("SIMBRIEF (OPTIONAL)"));
        panel.Controls.Add(_simbrief);
        panel.Controls.Add(Hint("With a SimBrief name the logbook logs every fix of your flight plan by name. " +
                                "Without one it records a position checkpoint every 15 minutes."));

        panel.Controls.Add(Heading("WHEN A FLIGHT ENDS"));
        panel.Controls.Add(_prompt);

        panel.Controls.Add(Heading("STARTING THE LOGBOOK"));
        panel.Controls.Add(_fsuipc);
        if (_fsuipcIni is null)
        {
            _fsuipc.Enabled = false;
            panel.Controls.Add(Hint("FSUIPC7 was not found on this PC, so this option is unavailable."));
        }
        else
        {
            try { _fsuipc.Checked = Fsuipc7Setup.IsInstalled(_fsuipcIni); } catch (Exception) { }
        }
        panel.Controls.Add(_windows);
        try { _windows.Checked = IsRegisteredWithWindows(); } catch (Exception) { }

        var ok = Theme.Btn("Save", primary: true);
        ok.Width = 110;
        ok.DialogResult = DialogResult.OK;
        var cancel = Theme.Btn("Cancel");
        cancel.Width = 110;
        cancel.DialogResult = DialogResult.Cancel;

        var buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            Height = 60,
            Padding = new Padding(22, 12, 22, 12),
            BackColor = Theme.Bg,
        };
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(ok);

        Controls.Add(panel);
        Controls.Add(buttons);
        AcceptButton = ok;
        CancelButton = cancel;

        FormClosing += (_, e) =>
        {
            if (DialogResult != DialogResult.OK) return;
            Result = new AppSettings
            {
                FuelUnit = _kg.Checked ? "kg" : "lb",
                SimBriefUser = _simbrief.Text.Trim(),
                PromptForPdf = _prompt.Checked,
                PdfFolder = current.PdfFolder,
                TrayHintShown = current.TrayHintShown,
            };
            ApplyStartupOptions();
        };
    }

    private void ApplyStartupOptions()
    {
        var exe = Application.ExecutablePath;
        try
        {
            if (_fsuipcIni is not null && _fsuipc.Enabled)
            {
                var installed = Fsuipc7Setup.IsInstalled(_fsuipcIni);
                if (_fsuipc.Checked && !installed) Fsuipc7Setup.Install(_fsuipcIni, exe);
                else if (!_fsuipc.Checked && installed) Fsuipc7Setup.Uninstall(_fsuipcIni);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "FSUIPC7 start-up could not be changed:\n" + ex.Message,
                "NAVDECK Logbook", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
            if (key is null) return;
            if (_windows.Checked) key.SetValue(RunName, $"\"{exe}\" --minimized");
            else key.DeleteValue(RunName, throwOnMissingValue: false);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, "Windows start-up could not be changed:\n" + ex.Message,
                "NAVDECK Logbook", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static bool IsRegisteredWithWindows()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return key?.GetValue(RunName) is string;
    }
}
