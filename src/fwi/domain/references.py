"""Versioned reference (master-data) domain core — PROVISIONAL.

Implements the mechanics of PRD `FR-002` (stable codes, explicit
namespace/category, versioned definitions, traceable change ownership)
WITHOUT defining any official vocabulary value. Registries start empty;
values are populated only from approved sources. Nothing here is an
FWI-03 standard or an official BGN classification.

Guardrails encoded here:
- duplicate codes per namespace are rejected (any status — resurrection
  must be an explicit superseding version, never a silent re-register);
- earlier versions are never silently overwritten (frozen records +
  append-only history with explicit change ownership);
- inactive and not-found references fail explicitly;
- relationships validate only against owner-approved rules; there is no
  automatic food-item -> material-category mapping;
- the ``kpi`` namespace is reserved: KPI computation/reporting is a separate
  concern and never reference master data. The HELD status of OP-08, FI-02
  and NI-03 (AGENTS.md / FWI-03 v1.3) concerns KPI computation and reporting
  only — it does NOT forbid an ordinary reference code in another namespace
  from coincidentally matching a held KPI identifier string (F-01 remediation;
  uniqueness is namespace + code, namespaces are separate identity spaces);
- no default unit or mass-basis conversion exists.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping, Optional

# --- Provisional vocabulary markers (not FWI-03 standards) -----------------

PROVISIONAL_REFERENCE_STATUSES = {"active", "inactive"}
VOCABULARY_STATUS = "provisional"  # every record is born provisional.

# Namespace names are examples mirroring PRD FR-002 wording
# (item pangan, kategori, unit, tahap, alasan/metode) — NOT an approved
# whitelist; any non-empty namespace string is accepted.
PROVISIONAL_NAMESPACE_EXAMPLES = (
    "food_item",
    "material_category",
    "unit",
    "stage",
    "reason",
    "method",
)

# Repo fact (AGENTS.md / FWI-03 v1.3): these KPI identifiers are HELD.
# Documentation only: this module neither activates nor computes any KPI, and
# these strings are NOT rejected as ordinary reference codes in other
# namespaces (uniqueness is namespace + code; see ReferenceKey).
HELD_KPI_CODES = frozenset({"OP-08", "FI-02", "NI-03"})
KPI_RESERVED_NAMESPACE = "kpi"


class ReferenceError(ValueError):
    """Base error for the reference domain core."""


class DuplicateReferenceError(ReferenceError):
    pass


class ReferenceNotFoundError(ReferenceError):
    pass


class InactiveReferenceError(ReferenceError):
    pass


class VersionSequenceError(ReferenceError):
    pass


class UnapprovedRelationshipError(ReferenceError):
    pass


class UnknownRelationshipRuleError(ReferenceError):
    pass


class NoApprovedMappingError(ReferenceError):
    pass


class NoDefaultConversionError(ReferenceError):
    pass


def _require_text(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ReferenceError(f"{field_name} must be a non-empty string")
    if value != value.strip():
        raise ReferenceError(f"{field_name} must not have leading/trailing spaces")
    return value


# --- Core records -----------------------------------------------------------


@dataclass(frozen=True)
class ReferenceKey:
    """Stable identity of a reference: namespace + code (namespace-scoped)."""

    namespace: str
    code: str

    def __post_init__(self) -> None:
        _require_text(self.namespace, "namespace")
        _require_text(self.code, "code")
        if self.namespace == KPI_RESERVED_NAMESPACE:
            # Namespace-level restriction only: KPI computation/reporting is
            # not reference master data. A code string equal to a held KPI
            # identifier (HELD_KPI_CODES) remains valid in ordinary
            # namespaces — HELD concerns KPI activation/computation, and
            # nothing here computes or activates any KPI.
            raise ReferenceError(
                "namespace 'kpi' is reserved; KPI identifiers are not reference master data"
            )


@dataclass(frozen=True)
class ChangeOwnership:
    """Who changed a reference version and when — always explicit & traceable."""

    changed_by: str
    changed_at: datetime
    note: Optional[str] = None

    def __post_init__(self) -> None:
        _require_text(self.changed_by, "changed_by")
        if not isinstance(self.changed_at, datetime):
            raise ReferenceError("changed_at must be an explicit datetime (no hidden clocks)")
        if self.changed_at.tzinfo is None:
            raise ReferenceError("changed_at must be timezone-aware")


@dataclass(frozen=True)
class ReferenceRecord:
    """One immutable version of a reference definition."""

    key: ReferenceKey
    version: int
    status: str
    label: str
    ownership: ChangeOwnership
    definition: Optional[str] = None
    supersedes_version: Optional[int] = None
    vocabulary_status: str = VOCABULARY_STATUS  # always provisional for now

    def __post_init__(self) -> None:
        if not isinstance(self.version, int) or isinstance(self.version, bool) or self.version < 1:
            raise VersionSequenceError("version must be an integer >= 1")
        if self.status not in PROVISIONAL_REFERENCE_STATUSES:
            raise ReferenceError(f"unsupported provisional status: {self.status!r}")
        _require_text(self.label, "label")
        if self.supersedes_version is not None:
            if not isinstance(self.supersedes_version, int) or self.supersedes_version < 1:
                raise VersionSequenceError("supersedes_version must be an integer >= 1")
            if self.supersedes_version >= self.version:
                raise VersionSequenceError(
                    "supersedes_version must be lower than the new version"
                )


@dataclass(frozen=True)
class RelationshipRule:
    """An owner-approved directed relationship between two namespaces."""

    name: str
    from_namespace: str
    to_namespace: str
    approved_by: str  # required: rule without owner approval cannot register

    def __post_init__(self) -> None:
        _require_text(self.name, "rule name")
        _require_text(self.from_namespace, "from_namespace")
        _require_text(self.to_namespace, "to_namespace")
        _require_text(self.approved_by, "approved_by")
        if self.from_namespace == self.to_namespace:
            raise ReferenceError("from_namespace and to_namespace must differ")


# --- Registry ---------------------------------------------------------------


class ReferenceRegistry:
    """Pure in-memory registry; the attachment point for future persistence.

    Duplicate codes in a namespace are rejected in ANY status: bringing a
    code back must go through an explicit superseding version, so history
    and ownership stay traceable and nothing is silently overwritten.
    """

    def __init__(self) -> None:
        self._versions: dict[ReferenceKey, list[ReferenceRecord]] = {}
        self._relationship_rules: dict[str, RelationshipRule] = {}

    # -- registration --------------------------------------------------

    def register(self, record: ReferenceRecord) -> ReferenceRecord:
        if record.version != 1 or record.supersedes_version is not None:
            raise VersionSequenceError(
                "a new code starts at version 1 with no supersedes_version; "
                "use register_superseding_version for later versions"
            )
        if record.key in self._versions:
            raise DuplicateReferenceError(
                f"duplicate reference code in namespace: {record.key.namespace}/{record.key.code}"
            )
        self._versions[record.key] = [record]
        return record

    def register_superseding_version(
        self,
        key: ReferenceKey,
        *,
        label: str,
        ownership: ChangeOwnership,
        status: str = "active",
        definition: Optional[str] = None,
    ) -> ReferenceRecord:
        """Create the next version explicitly; earlier versions are retained."""
        chain = self._versions.get(key)
        if chain is None:
            raise ReferenceNotFoundError(
                f"cannot supersede unknown reference: {key.namespace}/{key.code}"
            )
        previous = chain[-1]
        new_record = ReferenceRecord(
            key=key,
            version=previous.version + 1,
            status=status,
            label=label,
            ownership=ownership,
            definition=definition,
            supersedes_version=previous.version,
        )
        chain.append(new_record)
        return new_record

    # -- lookup: explicit not-found / inactive behavior ------------------

    def get(self, key: ReferenceKey, *, allow_inactive: bool = False) -> ReferenceRecord:
        chain = self._versions.get(key)
        if chain is None:
            raise ReferenceNotFoundError(
                f"reference not found: {key.namespace}/{key.code}"
            )
        latest = chain[-1]
        if latest.status == "inactive" and not allow_inactive:
            raise InactiveReferenceError(
                f"reference is inactive: {key.namespace}/{key.code} "
                f"(version {latest.version}); pass allow_inactive=True to inspect"
            )
        return latest

    def require_active(self, key: ReferenceKey) -> ReferenceRecord:
        return self.get(key)

    def history(self, key: ReferenceKey) -> tuple[ReferenceRecord, ...]:
        chain = self._versions.get(key)
        if chain is None:
            raise ReferenceNotFoundError(
                f"reference not found: {key.namespace}/{key.code}"
            )
        return tuple(chain)

    # -- relationships: only approved rules validate ----------------------

    def register_relationship_rule(self, rule: RelationshipRule) -> RelationshipRule:
        if not rule.approved_by.strip():
            raise UnapprovedRelationshipError(
                "relationship rules require an owner approver (approved_by)"
            )
        if rule.name in self._relationship_rules:
            raise DuplicateReferenceError(f"relationship rule already registered: {rule.name}")
        self._relationship_rules[rule.name] = rule
        return rule

    def validate_relationship(
        self, rule_name: str, source: ReferenceKey, target: ReferenceKey
    ) -> None:
        """Validate a relationship ONLY if an approved rule exists for it."""
        rule = self._relationship_rules.get(rule_name)
        if rule is None:
            raise UnknownRelationshipRuleError(
                f"no approved relationship rule named {rule_name!r}; "
                "relationships are not validated by default"
            )
        if source.namespace != rule.from_namespace or target.namespace != rule.to_namespace:
            raise UnapprovedRelationshipError(
                f"keys do not match rule {rule.name!r} "
                f"({rule.from_namespace} -> {rule.to_namespace})"
            )
        # both endpoints must exist and be active — explicit failures only.
        self.require_active(source)
        self.require_active(target)

    def map_to_material_category(
        self, food_item: ReferenceKey, *, rule_name: str = "food_item_to_material_category"
    ) -> None:
        """No automatic mapping: food items never auto-map to material categories.

        Even when an owner-approved mapping *rule* is registered, resolving a
        concrete food item -> material category pair needs persisted, approved
        mapping entries — an OPEN storage/owner decision outside this core.
        """
        if rule_name not in self._relationship_rules:
            raise NoApprovedMappingError(
                "no accepted mapping from food items to material categories; "
                "automatic mapping is not allowed without an owner-approved rule"
            )
        raise NoApprovedMappingError(
            "an approved mapping rule exists, but mapping entries are persisted "
            "owner-approved data (OPEN decision); this core never guesses targets"
        )

    # -- conversions: none by default -------------------------------------

    def convert_unit(self, value, from_unit: str, to_unit: str):  # noqa: ANN001
        raise NoDefaultConversionError(
            "no default unit conversion; conversions require owner-approved, "
            "documented factors (FWI-03)"
        )

    def convert_mass_basis(self, value, from_basis: str, to_basis: str):  # noqa: ANN001
        raise NoDefaultConversionError(
            "no default mass-basis conversion; conversions require documented "
            "yield evidence (FWI-02 v1.0 / FWI-03)"
        )


def provisional_namespaces() -> Mapping[str, str]:
    """Documented provisional namespace examples (labels only, no values)."""
    return {
        "food_item": "item pangan (contoh provisional)",
        "material_category": "kategori material (contoh provisional)",
        "unit": "satuan (contoh provisional)",
        "stage": "tahap operasional (contoh provisional)",
        "reason": "alasan (contoh provisional)",
        "method": "metode (contoh provisional)",
    }
