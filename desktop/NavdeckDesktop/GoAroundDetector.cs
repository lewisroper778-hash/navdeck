namespace NavdeckLink;

// Heuristic for possible missed approaches in MSFS. It never flies the plane.
// A single climb sample is not sufficient: the aircraft must first descend
// at approach height, then sustain a meaningful climb. All heights are AGL.
internal sealed record DetectedGoAround(
    string EventId, DateTime DetectedAtUtc, double RadioAltFt, double ClimbFpm);

internal sealed class GoAroundDetector
{
    private DateTime? _descentSince;
    private DateTime? _lastDescent;
    private DateTime? _climbSince;
    private DateTime _cooldownUntil;
    private double _lowestRadioAltFt = double.PositiveInfinity;
    private bool _armed;

    public DetectedGoAround? Update(Sample sample, DateTime nowUtc, bool airborne)
    {
        double ra = sample.RadioAltFt, vs = sample.VerticalSpeedFpm;
        if (!airborne || sample.OnGround ||
            !double.IsFinite(ra) || !double.IsFinite(vs) ||
            !double.IsFinite(sample.GroundSpeedKt) ||
            sample.GroundSpeedKt < 65 || ra < 35 || ra > 2500)
        {
            ResetApproach();
            return null;
        }
        if (nowUtc < _cooldownUntil)
        {
            ResetApproach();
            return null;
        }

        if (vs <= -350 && ra <= 1500)
        {
            _descentSince ??= nowUtc;
            _lastDescent = nowUtc;
            _lowestRadioAltFt = Math.Min(_lowestRadioAltFt, ra);
            if (nowUtc - _descentSince >= TimeSpan.FromSeconds(8))
                _armed = true;
            _climbSince = null;
        }
        else if (!_armed && _descentSince is { } began &&
                 nowUtc - began > TimeSpan.FromSeconds(12))
        {
            ResetApproach();
        }

        if (!_armed) return null;

        if (_lastDescent is not { } last ||
            nowUtc - last > TimeSpan.FromSeconds(60))
        {
            ResetApproach();
            return null;
        }

        if (ra < _lowestRadioAltFt) _lowestRadioAltFt = ra;

        // A sustained climb after approach descent, not a turbulence bounce.
        if (vs >= 650 && ra > _lowestRadioAltFt + 70)
            _climbSince ??= nowUtc;
        else if (vs < 350)
            _climbSince = null;

        if (_climbSince is not { } climb ||
            nowUtc - climb < TimeSpan.FromSeconds(7) ||
            ra - _lowestRadioAltFt < 170)
            return null;

        var detected = new DetectedGoAround(
            Guid.NewGuid().ToString(), nowUtc, Math.Round(ra),
            Math.Round(vs));

        // Another missed approach may be detected after a fresh descent,
        // but ignore immediate re-triggers while the climb continues.
        _cooldownUntil = nowUtc.AddSeconds(90);
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
        _descentSince = null;
        _lastDescent = null;
        _climbSince = null;
        _lowestRadioAltFt = double.PositiveInfinity;
        _armed = false;
    }
}
