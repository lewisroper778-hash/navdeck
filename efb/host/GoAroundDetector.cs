namespace NavdeckEfb;

// Detects missed approaches / go-arounds. It never flies the plane.
//
// 1. Approach: the aircraft descends below 3,000 ft above the ground for at least 6 seconds in total.
// 2. Go-around: after that, from a lowest point of 1,500 ft or less (3,000 ft with the gear down),
//    it climbs at least 200 ft at 400 fpm or more for 5 seconds, or climbs 400 ft or more in any way.
//
// Height is the radio altimeter, or altitude minus ground elevation when the radio altimeter reads nothing.
// Vertical speed is worked out from the altitude itself, so it does not depend on one FSUIPC offset
// that some aircraft do not fill in.
internal sealed record DetectedGoAround(
    string EventId, DateTime DetectedAtUtc, double RadioAltFt, double ClimbFpm);

internal sealed class GoAroundDetector
{
    private const double ApproachCeilingFt = 3000, DisarmAboveFt = 4000;

    private DateTime? _lastTime;
    private double _lastAlt = double.NaN, _vs = double.NaN;
    private double _descentSeconds;
    private DateTime? _lastDescent, _climbSince;
    private double _lowestFt = double.PositiveInfinity;
    private bool _armed, _gearDownOnApproach;
    private DateTime _cooldownUntil;

    public double VerticalSpeedFpm => _vs;

    public DetectedGoAround? Update(Sample s, DateTime nowUtc, bool airborne)
    {
        var dt = _lastTime is { } t ? (nowUtc - t).TotalSeconds : 0;
        // Vertical speed from the altitude, smoothed over about a second and a half.
        if (dt > 0.05 && dt < 5 && double.IsFinite(_lastAlt) && double.IsFinite(s.AltFt))
        {
            var raw = (s.AltFt - _lastAlt) / dt * 60;
            var k = Math.Min(1, dt / 1.5);
            _vs = double.IsFinite(_vs) ? _vs + (raw - _vs) * k : raw;
        }
        else if (dt >= 5 || !double.IsFinite(_lastAlt))
        {
            _vs = double.IsFinite(s.VerticalSpeedFpm) ? s.VerticalSpeedFpm : double.NaN;
        }
        _lastTime = nowUtc;
        _lastAlt = s.AltFt;
        dt = Math.Clamp(dt, 0, 2);

        var h = s.AglFt;
        var vs = _vs;
        if (!airborne || s.OnGround || !double.IsFinite(h) || !double.IsFinite(vs) || s.GroundSpeedKt < 60 || h > DisarmAboveFt)
        {
            ResetApproach();
            return null;
        }
        if (nowUtc < _cooldownUntil) return null;

        // 1. approach descent
        if (h <= ApproachCeilingFt && vs <= -250)
        {
            _descentSeconds += dt;
            _lastDescent = nowUtc;
            _lowestFt = Math.Min(_lowestFt, h);
            if (s.GearDown == true) _gearDownOnApproach = true;
            if (_descentSeconds >= 6) _armed = true;
        }
        if (_lastDescent is { } last && nowUtc - last > TimeSpan.FromMinutes(3))
        {
            ResetApproach();     // levelled off for a long time: holding or vectors, not an approach
            return null;
        }
        if (!_armed) return null;

        _lowestFt = Math.Min(_lowestFt, h);
        var gain = h - _lowestFt;
        var lowEnough = _lowestFt <= 1500 || (_gearDownOnApproach && _lowestFt <= ApproachCeilingFt);

        // 2. climb away
        if (vs >= 400 && gain >= 50) _climbSince ??= nowUtc;
        else if (vs < 150) _climbSince = null;

        var sustained = _climbSince is { } c && nowUtc - c >= TimeSpan.FromSeconds(5) && gain >= 200;
        var big = gain >= 400 && vs > 0;
        if (!lowEnough || !(sustained || big)) return null;

        var detected = new DetectedGoAround(Guid.NewGuid().ToString(), nowUtc, Math.Round(_lowestFt), Math.Round(vs));
        _cooldownUntil = nowUtc.AddSeconds(60);   // the rest of the climb is the same go-around
        ResetApproach();
        return detected;
    }

    public void Reset()
    {
        _cooldownUntil = DateTime.MinValue;
        ResetApproach();
    }

    private void ResetApproach()
    {
        _descentSeconds = 0;
        _lastDescent = null;
        _climbSince = null;
        _lowestFt = double.PositiveInfinity;
        _armed = false;
        _gearDownOnApproach = false;
    }
}
