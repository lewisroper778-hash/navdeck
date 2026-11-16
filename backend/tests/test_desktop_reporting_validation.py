"""Fast, dependency-free tests of desktop report completion rules."""

import unittest

try:
    from backend.reporting_validation import (
        desktop_report_blockers, desktop_signoff_blockers,
        go_around_review_blockers)
except ModuleNotFoundError:
    from reporting_validation import (
        desktop_report_blockers, desktop_signoff_blockers,
        go_around_review_blockers)


class ReportingValidationTests(unittest.TestCase):
    def sample(self):
        return {
            "waypoints": [
                {"ident": "FIX01", "ata": "12:30",
                 "actual_fob": "2500", "actual_alt": "32000"},
                {"ident": "FIX02", "ata": "12:45",
                 "actual_fob": "2300", "actual_alt": "31000"},
            ],
            "arrival_fob": "950",
            "landing_rate": "180",
            "times": {"off": "12:00", "takeoff": "12:16",
                      "landing": "13:50", "on": "14:00"},
        }

    def test_complete_flight(self):
        self.assertEqual(desktop_signoff_blockers(self.sample()), [])

    def test_missing_waypoint_fuel(self):
        f = self.sample()
        f["waypoints"][0]["actual_fob"] = ""
        self.assertIn("FIX01: actual fuel on board",
                      desktop_report_blockers(f))

    def test_missing_waypoint_ata_alt(self):
        f = self.sample()
        f["waypoints"][1]["ata"] = ""
        f["waypoints"][1]["actual_alt"] = None
        issues = desktop_report_blockers(f)
        self.assertIn("FIX02: actual waypoint time (ATA)", issues)
        self.assertIn("FIX02: actual altitude", issues)

    def test_skipped_waypoint_exempt(self):
        f = self.sample()
        f["waypoints"][1].update({
            "skipped": True, "ata": None, "actual_alt": None,
            "actual_fob": None})
        self.assertEqual(desktop_signoff_blockers(f), [])

    def test_no_waypoint_or_arrival_fuel(self):
        f = self.sample()
        f["waypoints"] = []
        f["arrival_fob"] = None
        issues = desktop_signoff_blockers(f)
        self.assertIn("Imported waypoint route", issues)
        self.assertIn("Arrival fuel on board at gate", issues)

    def test_utc_and_landing_rate_required(self):
        f = self.sample()
        f["times"]["landing"] = "bad"
        f["landing_rate"] = None
        issues = desktop_signoff_blockers(f)
        self.assertIn("Landing UTC", issues)
        self.assertIn("Landing rate", issues)

    def test_pending_go_around_prevents_signoff(self):
        f = self.sample()
        f["go_arounds"] = [{"id": "a", "review": "pending", "reason": ""}]
        self.assertIn("Go-around 1: review and reason required",
                      desktop_signoff_blockers(f))

    def test_confirmed_go_around_requires_reason(self):
        f = self.sample()
        f["go_arounds"] = [{"id": "a", "review": "confirmed",
                             "reason": "bad"}]
        self.assertEqual(len(go_around_review_blockers(f)), 1)
        f["go_arounds"][0]["reason"] = "Unstable approach"
        self.assertEqual(desktop_signoff_blockers(f), [])

    def test_false_detection_can_be_dismissed(self):
        f = self.sample()
        f["go_arounds"] = [{"id": "a", "review": "false_positive",
                             "reason": "Pilot reviewed"}]
        self.assertEqual(desktop_signoff_blockers(f), [])

    def test_multiple_go_arounds_all_need_review(self):
        f = self.sample()
        f["go_arounds"] = [
            {"id": "a", "review": "confirmed", "reason": "Poor visibility"},
            {"id": "b", "review": "pending", "reason": ""},
        ]
        self.assertEqual(len(go_around_review_blockers(f)), 1)
        f["go_arounds"][1]["review"] = "confirmed"
        f["go_arounds"][1]["reason"] = "ATC ordered go around"
        self.assertEqual(go_around_review_blockers(f), [])


if __name__ == "__main__":
    unittest.main()
