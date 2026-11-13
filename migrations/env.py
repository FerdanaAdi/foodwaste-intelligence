"""Demo-only Alembic environment; credentials are supplied via environment."""

import os

from alembic import context

import fwi.infrastructure.database.models_p1  # register candidate tables
from fwi.infrastructure.database.models import Base
from fwi.infrastructure.database.migration_safety import protect_downgrade
from fwi.infrastructure.database.session import create_engine_for_url

def run_guarded(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    operation = context.get_context().opts.get('fn')
    # Alembic 1.20.1 command.downgrade installs this named callback. Verify
    # before run_migrations, so even version-table DDL cannot precede refusal.
    if getattr(operation, '__name__', None) == 'downgrade':
        if context.is_offline_mode():
            raise RuntimeError('offline downgrade prohibited; use forward fix')
        protect_downgrade(connection, context.config.attributes.get('fwi_disposable_downgrade'))
    with context.begin_transaction():
        context.run_migrations()


connection = context.config.attributes.get('connection')
if connection is not None:
    run_guarded(connection)
else:
    engine = create_engine_for_url(os.environ['FWI_DATABASE_URL'])
    with engine.connect() as connection:
        run_guarded(connection)
    engine.dispose()
