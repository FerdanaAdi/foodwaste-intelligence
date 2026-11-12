"""Demo-only Alembic environment; credentials are supplied via environment."""

import os

from alembic import context

import fwi.infrastructure.database.models_p1  # register candidate tables
from fwi.infrastructure.database.models import Base
from fwi.infrastructure.database.session import create_engine_for_url

connection = context.config.attributes.get('connection')
if connection is not None:
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine_for_url(os.environ['FWI_DATABASE_URL'])
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
