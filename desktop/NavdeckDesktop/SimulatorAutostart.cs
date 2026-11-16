using System.Diagnostics;
using Microsoft.Win32;

namespace NavdeckLink;

// A lightweight per-user Windows startup watcher. Unlike FSUIPC7.ini,
// this does not require FSUIPC7, administrator rights, or a separate app.
// The watcher stays invisible until MSFS starts, then launches NAVDECK.
internal static class SimulatorAutostart
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "NAVDECK Desktop Simulator Watcher";
    private static string Command => "\"" + Application.ExecutablePath + "\" --watch-sim";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, false);
        return string.Equals(key?.GetValue(ValueName) as string,
            Command, StringComparison.OrdinalIgnoreCase);
    }

    public static bool Toggle()
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, true)
            ?? throw new InvalidOperationException("Windows startup settings unavailable");
        if (IsEnabled())
        {
            key.DeleteValue(ValueName, throwOnMissingValue: false);
            return false;
        }
        key.SetValue(ValueName, Command, RegistryValueKind.String);
        return true;
    }

    public static bool IsSimulatorRunning()
    {
        foreach (var name in new[] { "FlightSimulator", "FlightSimulator2024" })
        {
            using var running = Process.GetProcessesByName(name)
                .FirstOrDefault();
            if (running is not null) return true;
        }
        return false;
    }
}

internal sealed class SimulatorWatcherContext : ApplicationContext
{
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 4000 };

    public SimulatorWatcherContext()
    {
        _timer.Tick += (_, _) => Check();
        _timer.Start();
        Check();
    }

    private void Check()
    {
        try
        {
            // If the user opened NAVDECK manually, stop watching rather
            // than starting a duplicate window later.
            if (Mutex.TryOpenExisting("NavdeckDesktop.SingleInstance",
                out var running))
            {
                running.Dispose();
                ExitThread();
                return;
            }
            if (!SimulatorAutostart.IsSimulatorRunning()) return;
            _timer.Stop();
            Process.Start(new ProcessStartInfo(Application.ExecutablePath)
            {
                UseShellExecute = true,
                WorkingDirectory = AppContext.BaseDirectory
            });
            ExitThread();
        }
        catch (Exception)
        {
            // The watcher should not display modal errors at Windows login.
            // A later poll can retry if Windows or the sim is still starting.
        }
    }

    protected override void ExitThreadCore()
    {
        _timer.Stop();
        _timer.Dispose();
        base.ExitThreadCore();
    }
}
