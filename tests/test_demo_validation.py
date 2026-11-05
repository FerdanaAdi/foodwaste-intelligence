"""Fast tests for the provisional demo boundary (no database)."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from fwi.api.schemas_demo import MeasurementInput


def measurement_payload(**changes):
    payload = dict(gross='2.4', tare='0.4', net='2.0', original_unit='kg',
                   mass_basis='cooked', measurement_method='synthetic_scale',
                   provenance='synthetic fixture', observation_status='observed',
                   measured_at='2026-11-04T08:00:00+08:00')
    payload.update(changes)
    return payload


@pytest.mark.parametrize('field', ['gross', 'tare', 'net'])
@pytest.mark.parametrize('value', ['-1', 'NaN', 'Infinity', '-Infinity'])
def test_invalid_mass_rejected(field, value):
    with pytest.raises(ValidationError):
        MeasurementInput(**measurement_payload(**{field: value}))


@pytest.mark.parametrize('changes', [dict(gross='0.1'), dict(net='3'),
    dict(original_unit='g'), dict(mass_basis=''), dict(mass_basis='plate_leftover'),
    dict(measurement_method=''), dict(provenance=' '), dict(measured_at='2026-11-04T08:00:00'),
    dict(observation_status='missing'), dict(observation_status='measured_zero')])
def test_invalid_contract_rejected(changes):
    with pytest.raises(ValidationError):
        MeasurementInput(**measurement_payload(**changes))


def test_missing_zero_and_estimated_are_distinct():
    missing = MeasurementInput(**measurement_payload(gross=None, tare=None, net=None, observation_status='missing'))
    zero = MeasurementInput(**measurement_payload(gross='0.4', tare='0.4', net='0', observation_status='measured_zero'))
    estimate = MeasurementInput(**measurement_payload(observation_status='estimated'))
    assert missing.net is None
    assert zero.net == Decimal('0')
    assert estimate.observation_status == 'estimated'


def test_long_decimals_are_not_rounded_by_validation():
    value = '0.123456789012345678901234567890123456789'
    record = MeasurementInput(**measurement_payload(gross=value, tare='0', net=value))
    assert str(record.net) == value
