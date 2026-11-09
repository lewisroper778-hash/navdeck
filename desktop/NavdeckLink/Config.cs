using System.Text.Json;

namespace NavdeckLink;

// Stored in %APPDATA%\NAVDECK\link.json so it survives moving or updating the .exe
internal sealed class Config
{
    public string Code { get; set; } = "";

    private static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NAVDECK");
    private static readonly string FilePath = Path.Combine(Dir, "link.json");

    public static Config Load()
    {
        try
        {
            return File.Exists(FilePath) ? JsonSerializer.Deserialize<Config>(File.ReadAllText(FilePath)) ?? new Config() : new Config();
        }
        catch (Exception)
        {
            return new Config();
        }
    }

    public void Save()
    {
        Directory.CreateDirectory(Dir);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(this));
    }

    public static bool IsValidCode(string code)
    {
        var parts = code.Trim().Split('#', 2);
        return parts.Length == 2 && Uri.TryCreate(parts[0], UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps && parts[1].Length >= 30;
    }
}
