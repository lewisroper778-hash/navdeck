using System.Text.Json;
using System.Text.RegularExpressions;

namespace NavdeckLink;

// Stores only user-entered SimBrief settings while the desktop cloud endpoint
// is unavailable. Never stores the pairing token or web login credentials.
internal static class DesktopProfileCache
{
    private sealed class PendingProfile
    {
        public string? SimbriefPilotId { get; set; }
        public string? DisplayName { get; set; }
    }

    private static readonly string FilePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "NAVDECK", "pending-desktop-profile.json");

    private static PendingProfile? Load()
    {
        try
        {
            if (!File.Exists(FilePath))
                return null;
            return JsonSerializer.Deserialize<PendingProfile>(
                File.ReadAllText(FilePath));
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
        catch (JsonException) { return null; }
    }

    public static JsonElement? PendingPayload()
    {
        var saved = Load();
        return saved is null ? null : JsonSerializer.SerializeToElement(new
        {
            simbrief_pilot_id = saved.SimbriefPilotId,
            display_name = saved.DisplayName
        });
    }

    public static object ReadFallback()
    {
        var saved = Load();
        return new
        {
            profile = new
            {
                simbrief_pilot_id = saved?.SimbriefPilotId,
                display_name = saved?.DisplayName
            },
            sync_status = saved is null ? "server_upgrade_required" : "local_only"
        };
    }

    public static object Save(JsonElement? payload)
    {
        if (payload is not { } data ||
            data.ValueKind != JsonValueKind.Object)
            throw new ArgumentException("Invalid SimBrief settings");

        string? ReadText(string key)
        {
            if (!data.TryGetProperty(key, out var item) ||
                item.ValueKind == JsonValueKind.Null)
                return null;
            if (item.ValueKind != JsonValueKind.String)
                throw new ArgumentException("Invalid " + key);
            return item.GetString()?.Trim() is { Length: > 0 } value
                ? value : null;
        }

        var pilotId = ReadText("simbrief_pilot_id");
        var name = ReadText("display_name");
        if (pilotId is not null && !Regex.IsMatch(pilotId, @"^\d{1,16}$"))
            throw new ArgumentException("SimBrief Pilot ID must contain 1–16 digits");
        if (name is { Length: > 80 })
            throw new ArgumentException("Display name is too long");

        var saved = new PendingProfile
        {
            SimbriefPilotId = pilotId,
            DisplayName = name
        };
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(saved));
        File.Move(tmp, FilePath, overwrite: true);

        return ReadFallback();
    }

    public static void Clear()
    {
        try
        {
            if (File.Exists(FilePath))
                File.Delete(FilePath);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
