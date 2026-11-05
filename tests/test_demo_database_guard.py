"""Guard denial tests never connect or execute database DDL."""

from uuid import uuid4

import pytest

from test_demo_postgresql import drop_created_schema, verify_test_target


class Connection:
    def __init__(self, role='fwi_test', database='fwi_demo_test', version=180006, oid=42):
        self.identity = dict(role=role, database=database, version=version)
        self.oid = oid
        self.statements = []

    def execute(self, statement):
        self.statements.append(str(statement))
        return self

    def mappings(self):
        return self

    def one(self):
        return self.identity

    def scalar(self, statement, params):
        self.statements.append(str(statement))
        return self.oid


@pytest.mark.parametrize('identity', [dict(role='fwi_dev'), dict(role='postgres'),
    dict(database='fwi_demo_dev'), dict(database='postgres'), dict(version=170009), dict(version=190000)])
def test_wrong_identity_denied_before_ddl(identity):
    connection = Connection(**identity)
    with pytest.raises(RuntimeError):
        verify_test_target(connection, 'fwi_demo_test_' + uuid4().hex)
    assert not any('SCHEMA' in sql for sql in connection.statements)


@pytest.mark.parametrize('schema', ['public', 'fwi_demo_test_existing',
    'fwi_demo_test_11111111111111111111111111111111', 'other_' + uuid4().hex])
def test_wrong_schema_denied_before_queries(schema):
    connection = Connection()
    with pytest.raises((RuntimeError, ValueError)):
        verify_test_target(connection, schema)
    assert connection.statements == []


@pytest.mark.parametrize('created_oid', [None, 43])
def test_cleanup_denies_schema_not_created_by_fixture(created_oid):
    connection = Connection()
    with pytest.raises(RuntimeError):
        drop_created_schema(connection, 'fwi_demo_test_' + uuid4().hex, created_oid)
    assert not any('DROP' in sql for sql in connection.statements)


def test_valid_identity_and_exact_created_schema_allow_cleanup():
    connection = Connection()
    schema = 'fwi_demo_test_' + uuid4().hex
    drop_created_schema(connection, schema, 42)
    assert connection.statements[-1] == f'DROP SCHEMA "{schema}" CASCADE'
