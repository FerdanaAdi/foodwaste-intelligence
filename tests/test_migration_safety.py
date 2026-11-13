"""No real non-disposable database is accessed by target-denial tests."""
from types import SimpleNamespace
import pytest
from fwi.infrastructure.database.migration_safety import disposable_downgrade_permit, protect_downgrade

SCHEMA='fwi_demo_test_aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa'


class FakeConnection:
    def __init__(self, changes):
        self.identity=dict(role='fwi_test',database='fwi_demo_test',version=180006,schema=SCHEMA,search_path=SCHEMA)
        self.identity.update(changes)
        self.calls=[]
        self.namespace={'oid':123,'owned':True}
    def execute(self, statement, parameters=None):
        self.calls.append(str(statement))
        return SimpleNamespace(mappings=lambda:SimpleNamespace(one=lambda:self.identity,one_or_none=lambda:self.namespace))


@pytest.mark.parametrize('changes',[
    {'role':'owner'}, {'database':'fwi_demo_dev'}, {'version':170009},
    {'schema':'public'}, {'search_path':SCHEMA+', public'},
])
def test_non_test_identity_or_ambiguous_scope_is_refused_before_schema_queries(changes):
    connection=FakeConnection(changes)
    with pytest.raises(RuntimeError,match='identity/search_path'):
        disposable_downgrade_permit(connection,SCHEMA,123)
    assert len(connection.calls)==1
    assert all('LOCK TABLE' not in command for command in connection.calls)


@pytest.mark.parametrize('value',[None,True,{},'allow'])
def test_environment_or_untyped_values_never_authorize_downgrade(value):
    connection=FakeConnection({})
    with pytest.raises(RuntimeError,match='ordinary downgrade prohibited'):
        protect_downgrade(connection,value)
    assert connection.calls==[]


@pytest.mark.parametrize('namespace',[{'oid':124,'owned':True},{'oid':123,'owned':False}])
def test_wrong_oid_or_owner_refuses_before_locks(namespace):
    connection=FakeConnection({});connection.namespace=namespace
    with pytest.raises(RuntimeError,match='OID/owner'):
        disposable_downgrade_permit(connection,SCHEMA,123)
    assert len(connection.calls)==2
    assert all('LOCK TABLE' not in command for command in connection.calls)
