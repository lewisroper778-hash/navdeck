using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;

namespace NavdeckEfb;

// Holds the shared documents (flight, settings, library), saves them to disk and pushes every change
// to all connected screens (the Windows window and any tablets).
internal sealed class Store : IDisposable
{
    public readonly object Gate = new();
    private readonly string _dir, _flightsDir;
    private readonly HashSet<string> _dirty = [];
    private readonly List<Channel<string>> _clients = [];
    private readonly System.Threading.Timer _saveTimer;

    public JsonObject Flight { get; private set; }
    public JsonObject Settings { get; private set; }
    public JsonObject Library { get; private set; }
    public JsonArray History { get; private set; } = new JsonArray();
    public string LibraryDir { get; }
    public string DataDir => _dir;

    public Store(string? dir = null)
    {
        _dir = dir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NAVDECK EFB");
        _flightsDir = Path.Combine(_dir, "flights");
        LibraryDir = Path.Combine(_dir, "library");
        Directory.CreateDirectory(_flightsDir);
        Directory.CreateDirectory(Path.Combine(LibraryDir, "charts"));
        Directory.CreateDirectory(Path.Combine(LibraryDir, "docs"));

        Flight = Load("flight") ?? NewFlight();
        Settings = Load("settings") ?? new JsonObject();
        Library = Load("library") ?? new JsonObject();
        LoadHistory();
        _saveTimer = new System.Threading.Timer(_ => Flush(), null, 2000, 2000);
    }

    public static JsonObject NewFlight() => new()
    {
        ["id"] = Guid.NewGuid().ToString("N")[..12],
        ["created"] = DateTime.UtcNow.ToString("o"),
        ["times"] = new JsonObject(),
        ["fuel"] = new JsonObject(),
        ["navlog"] = new JsonArray(),
        ["goArounds"] = new JsonArray(),
        ["fuelChecks"] = new JsonArray(),
        ["crew"] = new JsonArray(),
        ["safety"] = new JsonArray(),
        ["movement"] = new JsonArray(),
        ["occ"] = new JsonObject { ["messages"] = new JsonObject(), ["turnaround"] = new JsonObject(), ["delays"] = new JsonArray() },
        ["gsx"] = new JsonObject { ["receipts"] = new JsonArray() },
    };

    private JsonObject? Load(string name)
    {
        try
        {
            var path = Path.Combine(_dir, name + ".json");
            return File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path)) as JsonObject : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private JsonObject Doc(string name) => name switch
    {
        "flight" => Flight,
        "settings" => Settings,
        "library" => Library,
        _ => throw new ArgumentException("Unknown document " + name),
    };

    // ---------------------------------------------------------------- changes

    public void ApplyOps(string doc, JsonArray ops)
    {
        lock (Gate)
        {
            var root = Doc(doc);
            foreach (var op in ops)
                if (op is JsonObject o) Apply(root, o);
            Touch(doc);
        }
    }

    // Call inside lock (Gate) after changing a document.
    public void Touch(string doc)
    {
        _dirty.Add(doc);
        Broadcast(new JsonObject { ["t"] = "doc", ["doc"] = doc, ["d"] = Doc(doc).DeepClone() });
    }

    public void ReplaceFlight(JsonObject flight)
    {
        lock (Gate)
        {
            Flight = flight;
            foreach (var (key, value) in NewFlight())
                if (Flight[key] is null && key != "id" && key != "created") Flight[key] = value?.DeepClone();
            if (Flight["id"] is null) Flight["id"] = Guid.NewGuid().ToString("N")[..12];
            Touch("flight");
        }
    }

    private static void Apply(JsonNode root, JsonObject op)
    {
        if (op["path"] is not JsonArray path || path.Count == 0) return;
        var kind = op["op"]?.GetValue<string>() ?? "set";
        var node = root;
        for (var i = 0; i < path.Count - 1; i++)
        {
            var child = Get(node, path[i]!);
            if (child is not JsonObject && child is not JsonArray)
            {
                child = path[i + 1]!.GetValueKind() == JsonValueKind.Number ? new JsonArray() : new JsonObject();
                Set(node, path[i]!, child);
            }
            node = child;
        }
        var last = path[^1]!;
        switch (kind)
        {
            case "set":
                Set(node, last, op["value"]?.DeepClone());
                break;
            case "push":
                if (Get(node, last) is not JsonArray list)
                {
                    list = new JsonArray();
                    Set(node, last, list);
                }
                list.Add(op["value"]?.DeepClone());
                break;
            case "del":
                if (node is JsonArray arr && last.GetValueKind() == JsonValueKind.Number)
                {
                    var index = last.GetValue<int>();
                    if (index >= 0 && index < arr.Count) arr.RemoveAt(index);
                }
                else if (node is JsonObject obj) obj.Remove(Key(last));
                break;
        }
    }

    private static string Key(JsonNode key) =>
        key.GetValueKind() == JsonValueKind.Number ? key.GetValue<int>().ToString() : key.GetValue<string>();

    private static JsonNode? Get(JsonNode node, JsonNode key)
    {
        if (node is JsonArray arr)
        {
            if (key.GetValueKind() != JsonValueKind.Number) return null;
            var i = key.GetValue<int>();
            return i >= 0 && i < arr.Count ? arr[i] : null;
        }
        return node is JsonObject obj ? obj[Key(key)] : null;
    }

    private static void Set(JsonNode node, JsonNode key, JsonNode? value)
    {
        if (node is JsonArray arr)
        {
            if (key.GetValueKind() != JsonValueKind.Number) return;
            var i = key.GetValue<int>();
            if (i < 0 || i > 100000) return;
            while (arr.Count <= i) arr.Add(null);
            arr[i] = value;
        }
        else if (node is JsonObject obj) obj[Key(key)] = value;
    }

    // ---------------------------------------------------------------- live updates to the screens

    public Channel<string> Subscribe()
    {
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(300) { FullMode = BoundedChannelFullMode.DropOldest });
        lock (_clients) _clients.Add(channel);
        return channel;
    }

    public void Unsubscribe(Channel<string> channel)
    {
        lock (_clients) _clients.Remove(channel);
    }

    public void Broadcast(JsonObject message)
    {
        var text = message.ToJsonString();
        lock (_clients)
            foreach (var c in _clients) c.Writer.TryWrite(text);
    }

    public void Notify(string title, string text, string kind = "info") =>
        Broadcast(new JsonObject { ["t"] = "notify", ["d"] = new JsonObject { ["title"] = title, ["text"] = text, ["kind"] = kind } });

    // ---------------------------------------------------------------- logbook of closed flights

    private void LoadHistory()
    {
        var items = new List<JsonObject>();
        foreach (var file in Directory.EnumerateFiles(_flightsDir, "*.json"))
        {
            try
            {
                if (JsonNode.Parse(File.ReadAllText(file)) is JsonObject f) items.Add(Summary(f));
            }
            catch (Exception)
            {
                // A damaged file must never stop the app opening.
            }
        }
        items.Sort((a, b) => string.CompareOrdinal(b["date"]?.GetValue<string>() ?? "", a["date"]?.GetValue<string>() ?? ""));
        History = new JsonArray(items.ToArray<JsonNode>());
    }

    private static JsonObject Summary(JsonObject f)
    {
        var t = f["times"] as JsonObject;
        var fu = f["fuel"] as JsonObject;
        double? block = J.Time(t?["out"]) is { } o && J.Time(t?["in"]) is { } i ? (i - o).TotalMilliseconds : null;
        double? burn = J.Num(fu?["out"]) is { } a && J.Num(fu?["in"]) is { } b ? a - b : null;
        return new JsonObject
        {
            ["id"] = J.Str(f["id"]),
            ["date"] = J.Str(t?["out"]) is { Length: > 0 } d ? d : J.Str(f["created"]),
            ["flightNo"] = J.Str(f["flightNo"]) is { Length: > 0 } n ? n : J.Str(f["callsign"]),
            ["dep"] = J.Str(f["dep"]),
            ["arr"] = f["diversion"] is JsonObject dv ? J.Str(dv["to"]) : J.Str(f["arr"]),
            ["type"] = J.Str(f["type"]),
            ["blockMs"] = block,
            ["rate"] = J.Num((f["landing"] as JsonObject)?["rate"]),
            ["burnKg"] = burn,
        };
    }

    // Archives the current flight. Returns an error message, or null when it was closed.
    public string? CloseFlight()
    {
        lock (Gate)
        {
            if (Flight["closed"] is not JsonObject closed || J.Str(closed["signature"]).Length == 0)
                return "The flight must be signed first.";
            if (Flight["goArounds"] is JsonArray ga && ga.Any(g => J.Str((g as JsonObject)?["reason"]).Length == 0))
                return "Enter the reason for every go-around first.";

            var id = SafeId(J.Str(Flight["id"]));
            WriteAtomic(Path.Combine(_flightsDir, id + ".json"), Flight.ToJsonString());
            for (var i = History.Count - 1; i >= 0; i--)
                if (J.Str((History[i] as JsonObject)?["id"]) == id) History.RemoveAt(i);
            History.Insert(0, Summary(Flight));
            _dirty.Add("flight");
            Broadcast(new JsonObject { ["t"] = "history", ["d"] = History.DeepClone() });
            return null;
        }
    }

    public string? ReadArchived(string id)
    {
        var path = Path.Combine(_flightsDir, SafeId(id) + ".json");
        return File.Exists(path) ? File.ReadAllText(path) : null;
    }

    public void DeleteArchived(string id)
    {
        lock (Gate)
        {
            try { File.Delete(Path.Combine(_flightsDir, SafeId(id) + ".json")); } catch (Exception) { }
            for (var i = History.Count - 1; i >= 0; i--)
                if (J.Str((History[i] as JsonObject)?["id"]) == id) History.RemoveAt(i);
            Broadcast(new JsonObject { ["t"] = "history", ["d"] = History.DeepClone() });
        }
    }

    private static string SafeId(string id) => new(id.Where(char.IsLetterOrDigit).Take(40).ToArray());

    // ---------------------------------------------------------------- saving

    public void Flush()
    {
        var pending = new Dictionary<string, string>();
        lock (Gate)
        {
            foreach (var doc in _dirty) pending[doc] = Doc(doc).ToJsonString();
            _dirty.Clear();
        }
        foreach (var (doc, json) in pending)
        {
            try { WriteAtomic(Path.Combine(_dir, doc + ".json"), json); } catch (Exception) { }
        }
    }

    private static void WriteAtomic(string path, string content)
    {
        var tmp = path + ".tmp";
        File.WriteAllText(tmp, content);
        File.Move(tmp, path, overwrite: true);
    }

    public void Dispose()
    {
        _saveTimer.Dispose();
        Flush();
    }
}

// Small helpers for reading loosely typed JSON safely.
internal static class J
{
    public static string Str(JsonNode? n)
    {
        if (n is not JsonValue v) return "";
        return v.GetValueKind() switch
        {
            JsonValueKind.String => v.GetValue<string>(),
            JsonValueKind.Number => v.ToJsonString(),
            _ => "",
        };
    }

    public static double? Num(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.GetValueKind() == JsonValueKind.Number && v.TryGetValue<double>(out var d)) return d;
        if (v.GetValueKind() == JsonValueKind.Number) return double.TryParse(v.ToJsonString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var p) ? p : null;
        return null;
    }

    public static bool Bool(JsonNode? n, bool fallback) =>
        n is JsonValue v && (v.GetValueKind() == JsonValueKind.True || v.GetValueKind() == JsonValueKind.False) ? v.GetValue<bool>() : fallback;

    public static DateTime? Time(JsonNode? n) =>
        DateTime.TryParse(Str(n), System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal, out var t) ? t : null;

    public static string Iso(DateTime t) => t.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ", System.Globalization.CultureInfo.InvariantCulture);
}
