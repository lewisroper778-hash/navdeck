namespace NavdeckLogbook;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Headless check used by the automated build: flies a simulated flight and writes a PDF.
        var test = Array.FindIndex(args, a => a.Equals("--selftest", StringComparison.OrdinalIgnoreCase));
        if (test >= 0)
        {
            var dir = test + 1 < args.Length ? args[test + 1] : Path.Combine(Path.GetTempPath(), "navdeck-selftest");
            return SelfTest.Run(dir);
        }

        using var single = new Mutex(true, "NavdeckLogbook.SingleInstance", out var first);
        if (!first)
        {
            MessageBox.Show("NAVDECK Logbook is already running. Look for its icon in the system tray.",
                "NAVDECK Logbook", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }

        ApplicationConfiguration.Initialize();
        var minimized = args.Any(a => a.Equals("--minimized", StringComparison.OrdinalIgnoreCase));
        Application.Run(new MainForm(minimized));
        return 0;
    }
}
