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
        public string? ConnectionHash { get; set; }
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

    // Bind pending entries to the pairing code without storing the token.
    // Unpaired entries must be explicitly re-saved after changing accounts.
    private static string ConnectionHash(string connection) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(connection.Trim())));

    private static PendingProfile? ForConnection(string connection)
    {
        var saved = Load();
        return saved?.ConnectionHash == ConnectionHash(connection)
            ? saved : null;
    }

    public static JsonElement? PendingPayload(string connection)
    {
        var saved = ForConnection(connection);
        return saved is null ? null : JsonSerializer.SerializeToElement(new
        {
            simbrief_pilot_id = saved.SimbriefPilotId,
            display_name = saved.DisplayName
        });
    }

    public static object ReadFallback(string connection)
    {
        var saved = ForConnection(connection);
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

    public static object Save(JsonElement? payload, string connection)
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
            DisplayName = name,
            ConnectionHash = ConnectionHash(connection)
        };
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(saved));
        File.Move(tmp, FilePath, overwrite: true);

        return ReadFallback(connection);
    }

    public static void Clear(string connection)
    {
        try
        {
            if (ForConnection(connection) is not null && File.Exists(FilePath))
                File.Delete(FilePath);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
