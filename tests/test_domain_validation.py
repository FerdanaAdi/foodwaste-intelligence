import unittest
from datetime import datetime, timezone
from fwi.domain.events import MaterialWasteEvent
from fwi.domain.measurements import MeasurementRecord, repeated_measurements


def event() -> MaterialWasteEvent:
    return MaterialWasteEvent(
        "EVT-SYN-001",
        "ORG-SYN-001",
        "SITE-SYN-001",
        datetime(2026, 11, 3, 10, 0, tzinfo=timezone.utc),
        datetime(2026, 11, 3, 10, 5, tzinfo=timezone.utc),
    )


class DomainValidationTests(unittest.TestCase):
    def measurement(self, **changes) -> MeasurementRecord:
        values = dict(
            measurement_id="M-SYN-001",
            waste_event_id="EVT-SYN-001",
            gross="2.40",
            tare="0.40",
            net="2.00",
            mass_basis="cooked",
        )
        values.update(changes)
        return MeasurementRecord(**values)

    def test_valid_measurement(self):
        record = self.measurement()
        self.assertIs(record.validate(event()), record)

    def test_gross_less_than_tare(self):
        with self.assertRaises(ValueError):
            self.measurement(gross="0.30", tare="0.40", net="-0.10").validate(event())

    def test_legitimate_zero_net(self):
        self.assertIsNotNone(self.measurement(gross="0.40", tare="0.40", net="0", observation_status="measured_zero").validate(event()))

    def test_missing_is_not_zero(self):
        record = self.measurement(gross=None, tare=None, net=None, observation_status="missing")
        record.validate(event())
        self.assertNotEqual(record.observation_status, "measured_zero")

    def test_measurement_without_valid_event(self):
        with self.assertRaises(ValueError):
            self.measurement().validate(None)

    def test_two_measurements_same_event_are_not_summed(self):
        first = self.measurement()
        second = self.measurement(measurement_id="M-SYN-002", gross="3", tare="1", net="2")
        records = repeated_measurements(event(), [first, second])
        self.assertEqual(len(records), 2)
        self.assertEqual([record.measurement_id for record in records], ["M-SYN-001", "M-SYN-002"])
        self.assertEqual({record.waste_event_id for record in records}, {"EVT-SYN-001"})
        self.assertIs(records[0], first)
        self.assertIs(records[1], second)

    def test_mass_basis_required(self):
        with self.assertRaises(ValueError):
            self.measurement(mass_basis=None).validate(event())

    def test_negative_mass_rejected(self):
        for field in ("gross", "tare", "net"):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "non-negative"):
                self.measurement(**{field: "-0.1"}).validate(event())

    def test_non_finite_mass_rejected(self):
        for value in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "finite"):
                self.measurement(gross=value).validate(event())

    def test_unsupported_unit_rejected(self):
        with self.assertRaisesRegex(ValueError, "must be kg"):
            self.measurement(unit="g").validate(event())

    def test_occurred_and_recorded_times_are_distinct(self):
        current = event()
        self.assertLess(current.occurred_at, current.recorded_at)


if __name__ == "__main__":
    unittest.main()
