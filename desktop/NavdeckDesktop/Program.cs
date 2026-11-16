namespace NavdeckLink;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        if (args.Any(arg => arg.Equals("--watch-sim", StringComparison.OrdinalIgnoreCase)))
        {
            using var watcher = new Mutex(true,
                "NavdeckDesktop.SimulatorWatcher", out var firstWatcher);
            if (firstWatcher) Application.Run(new SimulatorWatcherContext());
            return;
        }

        using var single = new Mutex(
            true,
            "NavdeckDesktop.SingleInstance",
            out var first
        );

        if (!first)
        {
            MessageBox.Show(
                "NAVDECK Desktop is already running.",
                "NAVDECK Desktop",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return;
        }

        Application.Run(new DesktopForm());
    }
}
