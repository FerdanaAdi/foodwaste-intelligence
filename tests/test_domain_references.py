"""Deterministic tests for the versioned reference domain core (FR-002 mechanics).

No official vocabulary values are invented: every fixture label/definition is a
plain demo string, and namespaces stay empty-until-registered.
"""

import unittest
from datetime import datetime, timedelta, timezone
from fractions import Fraction

from fwi.domain.references import (
    ChangeOwnership,
    DuplicateReferenceError,
    HELD_KPI_CODES,
    InactiveReferenceError,
    NoApprovedMappingError,
    NoDefaultConversionError,
    ReferenceError,
    ReferenceKey,
    ReferenceRecord,
    ReferenceNotFoundError,
    ReferenceRegistry,
    RelationshipRule,
    UnknownRelationshipRuleError,
    UnapprovedRelationshipError,
    VersionSequenceError,
    VOCABULARY_STATUS,
    provisional_namespaces,
)

T0 = datetime(2026, 11, 8, 8, 0, tzinfo=timezone.utc)
T1 = T0 + timedelta(days=1)


def owner(at: datetime = T0, by: str = "demo-owner") -> ChangeOwnership:
    return ChangeOwnership(changed_by=by, changed_at=at)


def material_category(code: str, label: str = "Demo label") -> ReferenceRecord:
    return ReferenceRecord(
        key=ReferenceKey(namespace="material_category", code=code),
        version=1,
        status="active",
        label=label,
        ownership=owner(),
    )


class ReferenceKeyTests(unittest.TestCase):
    def test_namespaces_scope_code_identity(self):
        self.assertEqual(
            ReferenceKey("material_category", "RICE"),
            ReferenceKey("material_category", "RICE"),
        )
        self.assertNotEqual(
            ReferenceKey("material_category", "RICE"),
            ReferenceKey("food_item", "RICE"),
        )

    def test_empty_or_padded_identifier_rejected(self):
        with self.assertRaises(ReferenceError):
            ReferenceKey("", "RICE")
        with self.assertRaises(ReferenceError):
            ReferenceKey("material_category", " RICE ")

    def test_held_kpi_identifier_strings_allowed_in_ordinary_namespaces(self):
        # F-01: HELD (OP-08/FI-02/NI-03) concerns KPI computation/reporting,
        # not ordinary master reference codes. Uniqueness stays namespace+code,
        # so the same string may exist in different namespaces.
        registry = ReferenceRegistry()
        for code in HELD_KPI_CODES:
            key = ReferenceKey("food_item", code)
            registry.register(
                ReferenceRecord(
                    key=key, version=1, status="active", label="Demo", ownership=owner()
                )
            )
            self.assertEqual(registry.get(key).label, "Demo")
        # cross-namespace reuse of one such string remains valid and distinct
        item_key = ReferenceKey("food_item", "OP-08")
        unit_key = ReferenceKey("unit", "OP-08")
        registry.register(
            ReferenceRecord(
                key=unit_key, version=1, status="active", label="Demo unit", ownership=owner()
            )
        )
        self.assertNotEqual(item_key, unit_key)
        self.assertEqual(len(registry.history(item_key)), 1)
        self.assertEqual(len(registry.history(unit_key)), 1)

    def test_kpi_namespace_reserved_even_for_held_kpi_strings(self):
        for code in HELD_KPI_CODES:
            with self.assertRaises(ReferenceError):
                ReferenceKey("kpi", code)
        with self.assertRaises(ReferenceError):
            ReferenceKey("kpi", "OP-01")

    def test_change_ownership_requires_explicit_timezone_aware_actor_time(self):
        with self.assertRaises(ReferenceError):
            ChangeOwnership(changed_by="", changed_at=T0)
        with self.assertRaises(ReferenceError):
            ChangeOwnership(changed_by="a", changed_at=datetime(2026, 11, 8))


class RegisterAndDuplicateTests(unittest.TestCase):
    def test_register_and_get_roundtrip_with_provisional_marker(self):
        registry = ReferenceRegistry()
        record = registry.register(material_category("RICE_MIXED"))
        got = registry.get(ReferenceKey("material_category", "RICE_MIXED"))
        self.assertEqual(got, record)
        self.assertEqual(got.vocabulary_status, VOCABULARY_STATUS)
        self.assertEqual(got.vocabulary_status, "provisional")

    def test_duplicate_code_in_same_namespace_rejected(self):
        registry = ReferenceRegistry()
        registry.register(material_category("RICE_MIXED"))
        with self.assertRaises(DuplicateReferenceError):
            registry.register(material_category("RICE_MIXED", label="duplikat"))

    def test_same_code_in_different_namespace_allowed(self):
        registry = ReferenceRegistry()
        registry.register(material_category("RICE"))
        registry.register(
            ReferenceRecord(
                key=ReferenceKey("food_item", "RICE"),
                version=1,
                status="active",
                label="Demo",
                ownership=owner(),
            )
        )
        self.assertEqual(len(registry.history(ReferenceKey("food_item", "RICE"))), 1)

    def test_duplicate_rejected_even_after_inactive(self):
        registry = ReferenceRegistry()
        key = ReferenceKey("material_category", "RICE_MIXED")
        registry.register(material_category("RICE_MIXED"))
        registry.register_superseding_version(
            key, label="Dinonaktifkan", ownership=owner(T1), status="inactive"
        )
        with self.assertRaises(DuplicateReferenceError):
            registry.register(material_category("RICE_MIXED"))


class VersioningTests(unittest.TestCase):
    def test_new_version_bumps_links_and_retains_old(self):
        registry = ReferenceRegistry()
        key = ReferenceKey("material_category", "RICE_MIXED")
        registry.register(material_category("RICE_MIXED"))
        v2 = registry.register_superseding_version(
            key, label="Nasi campur (revisi demo)", ownership=owner(T1, by="demo-reviewer")
        )
        self.assertEqual(v2.version, 2)
        self.assertEqual(v2.supersedes_version, 1)
        chain = registry.history(key)
        self.assertEqual([r.version for r in chain], [1, 2])
        # earlier version unchanged, never silently overwritten
        self.assertEqual(chain[0].label, "Demo label")
        self.assertEqual(chain[1].ownership.changed_by, "demo-reviewer")

    def test_first_version_must_be_version_one_without_supersedes(self):
        bad = ReferenceRecord(
            key=ReferenceKey("material_category", "X"),
            version=2,
            status="active",
            label="Demo",
            ownership=owner(),
        )
        with self.assertRaises(VersionSequenceError):
            ReferenceRegistry().register(bad)

    def test_supersedes_must_be_lower_than_version(self):
        with self.assertRaises(VersionSequenceError):
            ReferenceRecord(
                key=ReferenceKey("material_category", "X"),
                version=2,
                status="active",
                label="Demo",
                ownership=owner(),
                supersedes_version=2,
            )

    def test_cannot_supersede_unknown_reference(self):
        registry = ReferenceRegistry()
        with self.assertRaises(ReferenceNotFoundError):
            registry.register_superseding_version(
                ReferenceKey("material_category", "GHOST"),
                label="Demo",
                ownership=owner(),
            )

    def test_records_are_immutable(self):
        record = material_category("RICE")
        with self.assertRaises(Exception):
            record.label = "diubah"  # type: ignore[misc]


class LookupBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.registry = ReferenceRegistry()
        self.key = ReferenceKey("material_category", "RICE_MIXED")
        self.registry.register(material_category("RICE_MIXED"))

    def test_not_found_is_explicit(self):
        with self.assertRaises(ReferenceNotFoundError):
            self.registry.get(ReferenceKey("material_category", "GHOST"))

    def test_inactive_is_explicit_and_inspectable(self):
        self.registry.register_superseding_version(
            self.key, label="Nonaktif", ownership=owner(T1), status="inactive"
        )
        with self.assertRaises(InactiveReferenceError):
            self.registry.get(self.key)
        inactive = self.registry.get(self.key, allow_inactive=True)
        self.assertEqual(inactive.status, "inactive")

    def test_require_active_alias(self):
        got = self.registry.require_active(self.key)
        self.assertEqual(got.version, 1)


class RelationshipRuleTests(unittest.TestCase):
    def setUp(self):
        self.registry = ReferenceRegistry()
        self.registry.register(material_category("VEG"))
        self.registry.register(
            ReferenceRecord(
                key=ReferenceKey("food_item", "KANGKUNG"),
                version=1,
                status="active",
                label="Demo",
                ownership=owner(),
            )
        )

    def test_unknown_rule_is_not_validated(self):
        with self.assertRaises(UnknownRelationshipRuleError):
            self.registry.validate_relationship(
                "nonexistent", ReferenceKey("food_item", "KANGKUNG"),
                ReferenceKey("material_category", "VEG"),
            )

    def test_rule_requires_owner_approval_to_register(self):
        with self.assertRaises(ReferenceError):
            RelationshipRule(
                name="r", from_namespace="a", to_namespace="b", approved_by="  "
            )

    def test_approved_rule_validates_only_matching_active_pairs(self):
        self.registry.register_relationship_rule(
            RelationshipRule(
                name="demo_item_category",
                from_namespace="food_item",
                to_namespace="material_category",
                approved_by="demo-owner",
            )
        )
        self.registry.validate_relationship(
            "demo_item_category",
            ReferenceKey("food_item", "KANGKUNG"),
            ReferenceKey("material_category", "VEG"),
        )
        # wrong namespaces for this rule -> rejected
        with self.assertRaises(UnapprovedRelationshipError):
            self.registry.validate_relationship(
                "demo_item_category",
                ReferenceKey("material_category", "VEG"),
                ReferenceKey("food_item", "KANGKUNG"),
            )
        # inactive endpoint -> explicit inactive error, no silent pass
        self.registry.register_superseding_version(
            ReferenceKey("material_category", "VEG"),
            label="Nonaktif",
            ownership=owner(T1),
            status="inactive",
        )
        with self.assertRaises(InactiveReferenceError):
            self.registry.validate_relationship(
                "demo_item_category",
                ReferenceKey("food_item", "KANGKUNG"),
                ReferenceKey("material_category", "VEG"),
            )


class NoAutoMappingTests(unittest.TestCase):
    def test_no_mapping_by_default(self):
        registry = ReferenceRegistry()
        with self.assertRaises(NoApprovedMappingError):
            registry.map_to_material_category(ReferenceKey("food_item", "KANGKUNG"))

    def test_even_with_rule_no_guessed_target(self):
        registry = ReferenceRegistry()
        registry.register_relationship_rule(
            RelationshipRule(
                name="food_item_to_material_category",
                from_namespace="food_item",
                to_namespace="material_category",
                approved_by="demo-owner",
            )
        )
        with self.assertRaises(NoApprovedMappingError):
            registry.map_to_material_category(ReferenceKey("food_item", "KANGKUNG"))


class NoDefaultConversionTests(unittest.TestCase):
    def test_unit_conversion_rejected(self):
        with self.assertRaises(NoDefaultConversionError):
            ReferenceRegistry().convert_unit(Fraction(1), "kg", "g")

    def test_mass_basis_conversion_rejected(self):
        with self.assertRaises(NoDefaultConversionError):
            ReferenceRegistry().convert_mass_basis(Fraction(1), "raw", "cooked")


class ProvisionalMarkerTests(unittest.TestCase):
    def test_namespace_examples_carry_provisional_labels_and_no_values(self):
        examples = provisional_namespaces()
        self.assertIn("material_category", examples)
        for label in examples.values():
            self.assertIn("provisional", label)


if __name__ == "__main__":
    unittest.main()
