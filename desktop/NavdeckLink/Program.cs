namespace NavdeckLink;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        using var single = new Mutex(true, "NavdeckLink.SingleInstance", out var first);
        if (!first)
        {
            MessageBox.Show("NAVDECK Link is already running.", "NAVDECK Link", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(args.Contains("--minimized")));
    }
}
