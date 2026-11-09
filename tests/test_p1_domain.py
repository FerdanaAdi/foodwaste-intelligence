"""Pure-domain tests for the provisional P1/P2 candidate invariants.

No database: every rule here must hold before any persistence is trusted.
Scenario names trace to the P1 PRD extension acceptance IDs.
"""
from decimal import Decimal
from types import SimpleNamespace

import pytest

from fwi.domain import aggregation, disposition, distribution, kpi_catalogue, lineage, operations, production
from fwi.domain.operations import PolicyBlocked


def meas(status, net, unit='kg'):
    return SimpleNamespace(observation_status=status, net=Decimal(net) if net is not None else None,
                           original_unit=unit)


# ---------------------------------------------------------------- T-01..T-04 aggregation

def test_t01_repeated_measurements_make_mass_unresolved_never_summed():
    view = aggregation.basis_aggregation([('E1', [meas('observed', '2.0'), meas('observed', '3.0')])])
    assert view['status'] == 'unresolved_selection'
    assert view['eligible_mass'] is None
    assert view['event_count'] == 1 and view['measurement_count'] == 2
    assert view['unresolved_event_count'] == 1 and 'EXT-OD-03' in view['reason']


def test_single_observation_events_aggregate_with_measured_zero():
    view = aggregation.basis_aggregation([('E1', [meas('observed', '2.0')]),
                                          ('E2', [meas('measured_zero', '0')])])
    assert view['status'] == 'raw_observation_available'
    assert view['eligible_mass'] == Decimal('2.0')  # real measured zero adds 0, not missing-as-zero
    assert view['eligible_event_count'] == 2
    assert view['measured_zero_event_count'] == 1


def test_t03_t05_missing_and_estimated_block_a_complete_total():
    view = aggregation.basis_aggregation([('E1', [meas('observed', '2.0')]),
                                          ('E2', [meas('missing', None)]),
                                          ('E3', [meas('estimated', '9')])])
    assert view['status'] == 'incomplete_observation'
    assert view['eligible_mass'] is None  # no partial total presented as complete
    assert view['eligible_event_count'] == 1


def test_all_missing_observations_yield_no_usable_observation():
    view = aggregation.basis_aggregation([('E1', [meas('missing', None)]),
                                          ('E2', [meas('not_measured', None)])])
    assert view['status'] == 'no_usable_observation' and view['eligible_mass'] is None


def test_t04_incompatible_unit_is_refused_not_converted():
    view = aggregation.basis_aggregation([('E1', [meas('observed', '2000', unit='g')])])
    assert view['status'] == 'incompatible_unit' and view['eligible_mass'] is None


def movement(direction, quantity):
    return SimpleNamespace(direction=direction, quantity=Decimal(quantity))


def io_entry(io_kind, quantity, basis, unit='kg'):
    return SimpleNamespace(io_kind=io_kind, quantity=Decimal(quantity), mass_basis=basis,
                           original_unit=unit)


def link(source_type, source_id, target_type, target_id):
    return SimpleNamespace(source_type=source_type, source_id=source_id,
                           target_type=target_type, target_id=target_id)


# ---------------------------------------------------------------- FR-101

def test_signed_stock_and_negative_stock_policy():
    movements = [movement('in', '100.00'), movement('out', '30.00'), movement('in', '5.00')]
    stock = operations.signed_stock(movements)
    assert stock == Decimal('75.00')
    assert operations.observed_stock(Decimal('100.00'), movements) == Decimal('175.00')
    assert operations.movement_allowed(Decimal('75.00'), 'out', Decimal('75.00')) is True
    assert operations.movement_allowed(Decimal('75.00'), 'out', Decimal('75.01')) is False
    assert operations.movement_allowed(Decimal('75.00'), 'sideways', Decimal('1')) is False


def test_movement_type_direction_compatibility():
    operations.validate_movement('issue_to_batch', 'out')
    operations.validate_movement('transfer', 'in')
    with pytest.raises(ValueError):
        operations.validate_movement('issue_to_batch', 'in')
    with pytest.raises(ValueError):
        operations.validate_movement('return_from_batch', 'out')
    with pytest.raises(ValueError):
        operations.validate_movement('teleport', 'out')


# ---------------------------------------------------------------- FR-102

def test_yield_computed_and_rework_never_counted_twice():
    entries = [io_entry('input', '60.00', 'raw'), io_entry('input', '20.00', 'raw'),
               io_entry('output_primary', '76.00', 'raw'), io_entry('output_rework', '2.00', 'raw')]
    view = production.batch_yield(entries)
    assert view['status'] == 'computed'
    assert view['basis'] == 'raw'
    assert view['value'] == Decimal('76.00') / Decimal('80.00')
    assert view['input_total'] == Decimal('80.00')
    assert view['primary_output_total'] == Decimal('76.00')  # rework excluded from numerator
    assert view['rework_total'] == Decimal('2.00')


def test_yield_blocked_without_pairs_or_comparable_basis():
    assert production.batch_yield([])['status'] == 'blocked'
    assert production.batch_yield([io_entry('input', '10', 'raw')])['reason'] == \
        'no recorded primary output; yield blocked'
    mixed = production.batch_yield([io_entry('input', '10', 'raw'),
                                    io_entry('output_primary', '9', 'cooked')])
    assert mixed['status'] == 'blocked' and 'DR-11' in mixed['reason']
    assert mixed['value'] is None
    unit_mixed = production.batch_yield([io_entry('input', '10', 'raw', unit='kg'),
                                         io_entry('output_primary', '9', 'raw', unit='g')])
    assert unit_mixed['status'] == 'blocked'
    rework_basis = production.batch_yield([io_entry('input', '10', 'raw'),
                                           io_entry('output_primary', '9', 'raw'),
                                           io_entry('output_rework', '1', 'cooked')])
    assert rework_basis['rework_total'] is None  # never sum across bases


# ---------------------------------------------------------------- FR-103

def test_delivery_mismatch_is_review_status_not_waste():
    assert distribution.delivery_reconciliation(Decimal('100'), None) == 'not_received'
    assert distribution.delivery_reconciliation(Decimal('100'), Decimal('100')) == 'match'
    assert distribution.delivery_reconciliation(Decimal('100'), Decimal('95')) == 'needs_review'


def test_sampling_without_frame_never_extrapolates():
    assert distribution.sampling_coverage('class_rooms_a_c', 5, 'visual') == 'framed'
    assert distribution.sampling_coverage(None, 5, None) == 'unframed_sample'
    assert distribution.sampling_coverage(None, None, 'visual') == 'unframed_sample'
    assert distribution.sampling_coverage(None, None, None) == 'not_sampled'
    with pytest.raises(PolicyBlocked):
        distribution.population_estimate(sample=[1, 2, 3])


# ---------------------------------------------------------------- FR-104

def test_self_link_rejected_and_cycles_detected():
    with pytest.raises(ValueError):
        lineage.validate_link('lot', 'L1', 'lot', 'L1')
    lineage.validate_link('lot', 'L1', 'waste_event', 'E1')  # different objects is fine
    with pytest.raises(ValueError):
        lineage.validate_link('blob', 'X', 'lot', 'L1')
    edges = [link('waste_event', 'E1', 'lot', 'L1'), link('lot', 'L1', 'batch', 'B1')]
    assert lineage.creates_cycle(edges, ('batch', 'B1'), ('waste_event', 'E1')) is True
    assert lineage.creates_cycle(edges, ('batch', 'B1'), ('delivery', 'D1')) is False


def test_two_transfers_of_one_event_count_once():
    links = [link('waste_event', 'E1', 'lot', 'L1'), link('waste_event', 'E1', 'lot', 'L2'),
             link('waste_event', 'E2', 'lot', 'L3')]
    assert lineage.distinct_source_event_count(links) == 2  # E1 twice, E2 once


# ---------------------------------------------------------------- FR-105

def test_rescue_safety_gate_blocks_unassessed_and_unsafe():
    assert disposition.safety_gate('redistribution_handover', 'assessed_safe') is True
    with pytest.raises(ValueError):
        disposition.safety_gate('redistribution_handover', 'not_assessed')
    with pytest.raises(ValueError):
        disposition.safety_gate('animal_feed', 'assessed_unsafe')
    assert disposition.safety_gate('compost', 'not_assessed') is True  # non-rescue fate is recordable
    with pytest.raises(ValueError):
        disposition.safety_gate('magic', 'assessed_safe')


def test_allocation_warning_is_descriptive_only():
    assert disposition.allocation_status(Decimal('1'), Decimal('0'), None) == 'no_reference'
    assert disposition.allocation_status(Decimal('1'), Decimal('1'), Decimal('2')) == 'within_reference'
    assert disposition.allocation_status(Decimal('1.5'), Decimal('1'), Decimal('2')) == 'exceeds_reference'


# ---------------------------------------------------------------- P2 FR-201/202

def test_held_kpi_never_returns_numeric_on_any_path():
    for design_status in ('held', 'design_pass', 'conditional'):
        result = kpi_catalogue.preview('OP-08', design_status, numerator_basis='raw',
                                       denominator_basis='raw', prerequisites_met=True)
        assert result['status'] == 'held_blocked'
        assert 'value' not in result and 'result' not in result


def test_preview_basis_mismatch_is_blocked_na_with_reason():
    result = kpi_catalogue.preview('OP-03', 'design_pass', numerator_basis='raw',
                                   denominator_basis='cooked')
    assert result['status'] == 'blocked' and 'DR-11' in result['reason']


def test_design_pass_never_implies_operational_value():
    ready = kpi_catalogue.preview('OP-04', 'design_pass', prerequisites_met=True)
    assert ready['status'] == 'blocked'
    assert 'design-pass' in ready['reason']
    conditional = kpi_catalogue.preview('OP-99', 'conditional', prerequisites_met=True)
    assert conditional['status'] == 'blocked' and 'G-P2-METHOD' in conditional['reason']


def test_aggregation_preserves_long_decimal_sum_without_rounding():
    value = '0.12345678901234567890123456789'
    result = aggregation.basis_aggregation([('A', [meas('observed', value)]),
                                            ('B', [meas('observed', value)])])
    assert result['eligible_mass'] == Decimal('0.24691357802469135780246913578')


@pytest.mark.parametrize('values,expected,exponent', [
    (['1E+3', '0.00000000000000000000000000001', '0.00'], '1000.00000000000000000000000000001', -29),
    (['0.00', '0.0000'], '0.0000', -4),
    (['1.20', '2.0030'], '3.2030', -4),
])
def test_exact_raw_sum_preserves_source_scale(values, expected, exponent):
    result = aggregation.exact_decimal_sum([Decimal(v) for v in values])
    assert result == Decimal(expected)
    assert result.as_tuple().exponent == exponent


def test_single_raw_observation_is_never_effective_mass():
    view = aggregation.basis_aggregation([('one', [meas('observed', '2.00')])])
    assert view['raw_observed_mass'] == Decimal('2.00')
    assert view['reportable_mass'] is None
    # Legacy internal arithmetic alias is not approval or a public report total.
    assert view['eligible_mass'] == view['raw_observed_mass']


def test_invalid_mass_basis_is_explicit_not_available():
    result = aggregation.basis_aggregation([('one', [meas('observed', '2')])], basis='unsupported')
    assert result['status'] == 'incompatible_basis' and result['raw_observed_mass'] is None


@pytest.mark.parametrize('invalid', ['NaN', 'Infinity', '-1'])
def test_exact_raw_sum_rejects_invalid_operands(invalid):
    with pytest.raises(ValueError):
        aggregation.exact_decimal_sum([Decimal(invalid)])
