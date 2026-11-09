using System.Diagnostics;
using System.Text.RegularExpressions;

namespace NavdeckLink;

// Adds/removes "RunIfN=READY,CLOSE,<this exe>" in FSUIPC7.ini so FSUIPC opens NAVDECK Link with the sim
internal static class Fsuipc7Setup
{
    private const string ExeName = "NavdeckLink.exe";

    public static string? FindIni()
    {
        var dirs = new List<string>();
        try
        {
            foreach (var p in Process.GetProcessesByName("FSUIPC7"))
                if (Path.GetDirectoryName(p.MainModule?.FileName) is { } d) dirs.Add(d);
        }
        catch (Exception) { }
        dirs.AddRange([
            @"C:\FSUIPC7",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "FSUIPC7"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FSUIPC7"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FSUIPC7"),
        ]);
        return dirs.Select(d => Path.Combine(d, "FSUIPC7.ini")).FirstOrDefault(File.Exists);
    }

    public static bool IsInstalled(string ini) =>
        File.ReadAllLines(ini).Any(l => IsOurLine(l));

    public static void Install(string ini, string exePath)
    {
        var lines = File.ReadAllLines(ini).Where(l => !IsOurLine(l)).ToList();
        BackupOnce(ini);
        var start = lines.FindIndex(l => l.Trim().Equals("[Programs]", StringComparison.OrdinalIgnoreCase));
        if (start < 0)
        {
            lines.Add("");
            lines.Add("[Programs]");
            start = lines.Count - 1;
        }
        var end = lines.FindIndex(start + 1, l => l.TrimStart().StartsWith('['));
        if (end < 0) end = lines.Count;
        var used = lines.Skip(start + 1).Take(end - start - 1)
            .Select(l => Regex.Match(l, @"^\s*Run(?:If)?(\d+)\s*=", RegexOptions.IgnoreCase))
            .Where(m => m.Success).Select(m => int.Parse(m.Groups[1].Value)).ToHashSet();
        var n = Enumerable.Range(1, 16).FirstOrDefault(i => !used.Contains(i));
        if (n == 0) throw new InvalidOperationException("FSUIPC7 already has 16 programs set to run. Remove one from the [Programs] section first.");
        lines.Insert(end, $"RunIf{n}=READY,CLOSE,\"{exePath}\"");
        File.WriteAllLines(ini, lines);
    }

    public static void Uninstall(string ini) =>
        File.WriteAllLines(ini, File.ReadAllLines(ini).Where(l => !IsOurLine(l)));

    private static bool IsOurLine(string l) =>
        Regex.IsMatch(l, @"^\s*Run(?:If)?\d+\s*=", RegexOptions.IgnoreCase) && l.Contains(ExeName, StringComparison.OrdinalIgnoreCase);

    private static void BackupOnce(string ini)
    {
        var backup = ini + ".navdeck-backup";
        if (!File.Exists(backup)) File.Copy(ini, backup);
    }
}
