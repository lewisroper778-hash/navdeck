namespace NavdeckLink;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
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

        ApplicationConfiguration.Initialize();
        Application.Run(new DesktopForm());
    }
}
