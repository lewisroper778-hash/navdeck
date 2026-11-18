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
    public JsonObject Safety { get; private set; }
    public JsonArray History { get; private set; } = new JsonArray();
    public string LibraryDir { get; }
    public string DataDir => _dir;

    public Store(string? dir = null)
    {
        _dir = dir ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NAVDECK EFB");
        _flightsDir = Path.Combine(_dir, "flights");
        LibraryDir = Path.Combine(_dir, "library");
        Directory.CreateDirectory(_flightsDir);
        Directory.CreateDirectory(Path.Combine(LibraryDir, "docs"));
        SeedManuals(Path.Combine(AppContext.BaseDirectory, "manuals"));

        Flight = Load("flight") ?? NewFlight();
        Settings = Load("settings") ?? new JsonObject();
        Library = Load("library") ?? new JsonObject();
        Safety = Load("safety") ?? new JsonObject();
        if (Safety["reports"] is not JsonObject) Safety["reports"] = new JsonObject();
        LoadHistory();
        _saveTimer = new System.Threading.Timer(_ => Flush(), null, 2000, 2000);
    }

    // Copies the bundled NAVDECK QRH and FCOM PDFs into the Documents library. Each file is copied once:
    // a pilot who deletes one does not get it back, and new manuals from an update are added.
    public int SeedManuals(string source)
    {
        if (!Directory.Exists(source)) return 0;
        var docs = Path.Combine(LibraryDir, "docs");
        var record = Path.Combine(LibraryDir, "manuals-added.txt");
        var done = new HashSet<string>(File.Exists(record) ? File.ReadAllLines(record) : Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
        var added = new List<string>();
        foreach (var file in Directory.EnumerateFiles(source, "*.pdf", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(source, file).Replace('\\', '/');
            if (done.Contains(rel)) continue;
            try
            {
                var target = Path.Combine(docs, rel.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                if (!File.Exists(target)) File.Copy(file, target);
                added.Add(rel);
            }
            catch (IOException)
            {
                // Try again next start.
            }
        }
        if (added.Count > 0) File.AppendAllLines(record, added);
        return added.Count;
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
        "safety" => Safety,
        _ => throw new ArgumentException("Unknown document " + name),
    };

    // ---------------------------------------------------------------- changes

    public void ApplyOps(string doc, JsonArray ops)
    {
        lock (Gate)
        {
            var root = Doc(doc);
            foreach (var op in ops)
                if (op is JsonObject o && (doc != "safety" || SafetyOpAllowed(o))) Apply(root, o);
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
            var notFiled = RequiredSafety(Flight).Where(r => !r.Closed).ToList();
            if (notFiled.Count > 0)
                return "Complete and close the required safety report first: " + string.Join("; ", notFiled.Select(r => $"{r.Name} ({r.Why})")) + ".";

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

    // ---------------------------------------------------------------- safety reports
    // Reports live in safety.json, apart from the flight, so they stay open across flights until closed.
    // A closed report is locked: no more edits, and it cannot be deleted.

    private JsonObject SafetyReports => (JsonObject)Safety["reports"]!;

    public double HardLandingFpm => J.Num(Settings["hardLandingFpm"]) is { } v && v > 0 ? v : 600;
    public double MinLandingFuelKg => J.Num(Settings["minLandingFuelKg"]) is { } v && v > 0 ? v : 1500;

    public sealed record RequiredReport(string Type, string Name, string Why, bool Closed);

    // Safety reports a flight must have (filed and closed) before it can be signed and closed:
    // any go-around or touch-and-go, a hard landing, or landing with less than the minimum fuel.
    // Same rules as requiredReports() in web/js/safety-types.js. Call inside lock (Gate).
    public List<RequiredReport> RequiredSafety(JsonObject f)
    {
        var need = new List<(string Type, string Name, string Why)>();
        if (f["goArounds"] is JsonArray ga && ga.Count > 0)
            need.Add(("unstable", "Unstable approach / go-around", ga.Count == 1 ? "go-around detected" : $"{ga.Count} go-arounds detected"));
        if (J.Num(f["landing"]?["rate"]) is { } rate && rate >= HardLandingFpm)
            need.Add(("hardlanding", "Hard landing / tailstrike", $"landing rate {rate:0} fpm"));
        if (J.Num(f["fuel"]?["on"]) is { } fob && fob < MinLandingFuelKg)
            need.Add(("fuel", "Fuel event", $"landed with {fob:N0} kg, below the {MinLandingFuelKg:N0} kg minimum"));
        var id = J.Str(f["id"]);
        var mine = SafetyReports.Select(kv => kv.Value as JsonObject).Where(r => r is not null && J.Str(r["flight"]?["id"]) == id).ToList();
        return need.Select(n => new RequiredReport(n.Type, n.Name, n.Why,
            mine.Any(r => J.Str(r!["type"]) == n.Type && J.Str(r["status"]) == "closed"))).ToList();
    }

    private bool SafetyOpAllowed(JsonObject op)
    {
        if (op["path"] is not JsonArray path || path.Count < 2 || J.Str(path[0]) != "reports") return false;
        var report = SafetyReports[J.Str(path[1])] as JsonObject;
        if (report is null) return false;                                   // reports are opened through OpenSafety
        if (J.Str(report["status"]) == "closed") return false;
        if (path.Count == 2) return J.Str(op["op"]) == "del";               // only whole-report delete while open
        var key = J.Str(path[2]);
        return key is "fields" or "narrative" or "severity" or "title" or "flight";
    }

    public JsonObject OpenSafety(JsonObject request, DateTime now)
    {
        lock (Gate)
        {
            var year = now.Year;
            var seq = J.Str(Safety["seqYear"]) == year.ToString() ? (int)(J.Num(Safety["seq"]) ?? 0) : 0;
            seq++;
            Safety["seq"] = seq;
            Safety["seqYear"] = year.ToString();
            var id = Guid.NewGuid().ToString("N")[..12];
            var report = new JsonObject
            {
                ["id"] = id,
                ["number"] = $"SR-{year}-{seq:0000}",
                ["type"] = J.Str(request["type"]),
                ["typeName"] = J.Str(request["typeName"]),
                ["title"] = J.Str(request["title"]),
                ["status"] = "open",
                ["openedAt"] = J.Iso(now),
                ["openedBy"] = J.Str(request["openedBy"]),
                ["severity"] = J.Str(request["severity"]),
                ["flight"] = request["flight"] is JsonObject fl ? fl.DeepClone() : new JsonObject(),
                ["fields"] = request["fields"] is JsonObject fi ? fi.DeepClone() : new JsonObject(),
                ["labels"] = request["labels"] is JsonObject la ? la.DeepClone() : new JsonObject(),
                ["required"] = request["required"] is JsonArray rq ? rq.DeepClone() : new JsonArray(),
                ["narrative"] = J.Str(request["narrative"]),
            };
            SafetyReports[id] = report;
            Touch("safety");
            return (JsonObject)report.DeepClone();
        }
    }

    // Returns null when closed, or the reason it cannot be closed yet.
    public string? CloseSafety(string id, JsonObject closure, DateTime now, out JsonObject? closedReport)
    {
        closedReport = null;
        lock (Gate)
        {
            if (SafetyReports[id] is not JsonObject r) return "Report not found.";
            if (J.Str(r["status"]) == "closed") return "This report is already closed.";
            var missing = new List<string>();
            if (J.Str(r["severity"]).Length == 0) missing.Add("severity");
            if (J.Str(r["narrative"]).Trim().Length < 10) missing.Add("what happened (at least a sentence)");
            var fields = r["fields"] as JsonObject;
            foreach (var key in (r["required"] as JsonArray ?? new JsonArray()).Select(k => J.Str(k)))
                if (fields?[key] is null || (J.Str(fields[key]).Trim().Length == 0 && J.Num(fields[key]) is null))
                    missing.Add(J.Str(r["labels"]?[key]) is { Length: > 0 } l ? l : key);
            if (J.Str(closure["name"]).Trim().Length == 0) missing.Add("your name");
            if (J.Str(closure["outcome"]).Trim().Length == 0) missing.Add("the outcome");
            if (missing.Count > 0) return "Complete before closing: " + string.Join(", ", missing) + ".";

            r["status"] = "closed";
            r["closed"] = new JsonObject
            {
                ["time"] = J.Iso(now),
                ["name"] = J.Str(closure["name"]).Trim(),
                ["outcome"] = J.Str(closure["outcome"]).Trim(),
                ["actions"] = J.Str(closure["actions"]).Trim(),
                ["signature"] = J.Str(closure["signature"]),
            };
            Touch("safety");
            closedReport = (JsonObject)r.DeepClone();
            return null;
        }
    }

    public void MarkSafety(string id, string key, string value)
    {
        lock (Gate)
        {
            if (SafetyReports[id] is not JsonObject r) return;
            r[key] = value;
            Touch("safety");
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
