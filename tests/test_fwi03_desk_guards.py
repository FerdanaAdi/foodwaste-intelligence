"""Exact FWI-03 source IDs; guard coverage, never authorization of KPI formulas."""
from decimal import Decimal
from types import SimpleNamespace as Row
from fwi.domain import aggregation, production, lineage


def test_fwi03_t16_missing_is_not_measured_zero_guard_only():
    missing = aggregation.basis_aggregation([('source-event',[Row(observation_status='missing',net=None,original_unit='kg')])])
    zero = aggregation.basis_aggregation([('source-event',[Row(observation_status='measured_zero',net=Decimal('0'),original_unit='kg')])])
    assert missing['raw_observed_mass'] is None
    assert zero['raw_observed_mass'] == Decimal('0')
    assert missing['event_count'] == zero['event_count'] == 1
    # Scheduling denominator and coverage % do not exist in this slice.


def test_fwi03_t17_five_over_zero_has_no_numeric_result():
    result = production.batch_yield([
        Row(io_kind='input',quantity=Decimal('0'),mass_basis='cooked',original_unit='kg'),
        Row(io_kind='output_primary',quantity=Decimal('5'),mass_basis='cooked',original_unit='kg')])
    assert result['status']=='blocked' and result['value'] is None
    assert 'zero' in result['reason']


def test_fwi03_t18_raw_twenty_over_cooked_hundred_is_blocked():
    result = production.batch_yield([
        Row(io_kind='input',quantity=Decimal('100'),mass_basis='cooked',original_unit='kg'),
        Row(io_kind='output_primary',quantity=Decimal('20'),mass_basis='raw',original_unit='kg')])
    assert result['status']=='blocked' and result['value'] is None
    assert 'mass bases do not match' in result['reason']


def test_fwi03_t19_disposition_link_keeps_one_event_guard_only():
    links=[Row(source_type='waste_event',source_id='stable-event',target_type='lot',target_id='compost-reference')]
    assert lineage.distinct_source_event_count(links)==1
    observed = aggregation.basis_aggregation([('stable-event',[Row(observation_status='observed',net=Decimal('0.8'),original_unit='kg')])])
    assert observed['event_count']==1 and observed['measurement_count']==1
    assert observed['raw_observed_mass']==Decimal('0.8')
    # No disposition quantity is added to the source mass; reportability policy stays OPEN.
