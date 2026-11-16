using NavdeckLink;

static Sample Approach(double radioAltFt, double vsFpm, bool ground = false) =>
    new(OnGround: ground, GroundSpeedKt: 135,
        TouchdownFpm: 0, ParkingBrake: false, FuelLb: 3000,
        RadioAltFt: radioAltFt, VerticalSpeedFpm: vsFpm);

static void Check(bool success, string name)
{
    if (!success) throw new Exception("FAILED: " + name);
    Console.WriteLine("Passed: " + name);
}

var t = new DateTime(2026, 11, 16, 12, 0, 0, DateTimeKind.Utc);

// Normal approach followed by landing: no go-around detection.
var d = new GoAroundDetector();
bool fired = false;
for (int i = 0; i < 16; i++)
    fired |= d.Update(Approach(1100 - i * 55, -750),
        t.AddSeconds(i), true) is not null;
fired |= d.Update(Approach(0, 0, true), t.AddSeconds(17), false)
    is not null;
Check(!fired, "normal landing is not a go-around");

// Takeoff/climb without an observed approach must not trigger an alert.
d.Reset();
fired = false;
for (int i = 0; i < 35; i++)
    fired |= d.Update(Approach(150 + i * 30, 1050),
        t.AddSeconds(i), true) is not null;
Check(!fired, "normal climb does not trigger");

// Stable descent followed by a sustained climb from near the ground.
d.Reset();
for (int i = 0; i < 11; i++)
    d.Update(Approach(1000 - i * 45, -700), t.AddSeconds(i), true);
DetectedGoAround? eventOne = null;
int count = 0;
for (int j = 1; j <= 25; j++)
{
    var result = d.Update(Approach(550 + j * 28, 1100),
        t.AddSeconds(10 + j), true);
    if (result is not null)
    {
        count++;
        eventOne = result;
    }
}
Check(count == 1 && eventOne is { RadioAltFt: > 700 },
    "go-around detected once after sustained missed approach");
Check(Guid.TryParse(eventOne!.EventId, out _), "event has stable UUID");

// A short altitude bounce / three seconds of climb is insufficient.
d.Reset();
for (int i = 0; i < 11; i++)
    d.Update(Approach(1000 - i * 45, -700), t.AddSeconds(i), true);
fired = false;
for (int i = 1; i < 5; i++)
    fired |= d.Update(Approach(550 + i * 35, 750),
        t.AddSeconds(10 + i), true) is not null;
Check(!fired, "brief climb does not trigger");

// After a suitable period and another descent, a second missed approach is valid.
d.Reset();
for (int i = 0; i < 11; i++)
    d.Update(Approach(1000 - i * 45, -700), t.AddSeconds(i), true);
for (int i = 1; i < 13; i++)
    d.Update(Approach(550 + i * 30, 1000),
        t.AddSeconds(10 + i), true);
DetectedGoAround? second = null;
for (int i = 0; i < 11; i++)
    d.Update(Approach(1100 - i * 45, -800),
        t.AddSeconds(160 + i), true);
for (int i = 1; i < 16; i++)
    second ??= d.Update(Approach(650 + i * 30, 1100),
        t.AddSeconds(170 + i), true);
Check(second is not null, "another missed approach can be recorded");

// Invalid radio altitude must fail safe.
d.Reset();
fired = d.Update(Approach(double.NaN, 1200), t, true) is not null;
Check(!fired, "missing radio altitude cannot generate an alert");
Console.WriteLine("All go-around detector checks passed.");
