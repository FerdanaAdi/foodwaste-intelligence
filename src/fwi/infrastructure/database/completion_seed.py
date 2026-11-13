"""Explicit Owner-controlled synthetic authority bootstrap; never startup/HTTP."""
from fwi.application import security,master
from fwi.infrastructure.database.models import MasterNamespaceApproval,MasterAdministration,ReviewAuthority,Principal,Site


def seed_authorities(factory,*,masters=(),reviewers=()):
    with factory() as session,session.begin():
        for principal_id,namespace,source_ref in masters:
            if namespace not in master.provisional_namespaces() or not source_ref.strip():raise ValueError('approved registered namespace/source required')
            if not session.get(Principal,principal_id):raise ValueError('principal must exist')
            approval=session.get(MasterNamespaceApproval,namespace)
            if approval and approval.source_ref!=source_ref:raise ValueError('source approval cannot be overwritten')
            if not approval:session.add(MasterNamespaceApproval(namespace=namespace,source_ref=source_ref));session.flush()
            if session.get(MasterAdministration,(principal_id,namespace)) is None:
                session.add(MasterAdministration(principal_id=principal_id,namespace=namespace))
                security.security_audit(session,None,'auth_master_grants',principal_id,'seeded','Owner-designated synthetic namespace: '+namespace+'; '+source_ref)
        for principal_id,site_id in reviewers:
            if not session.get(Principal,principal_id) or not session.get(Site,site_id):raise ValueError('explicit existing principal/site required')
            if session.get(ReviewAuthority,(principal_id,site_id)) is None:
                session.add(ReviewAuthority(principal_id=principal_id,site_id=site_id))
                security.security_audit(session,None,'auth_review_grants',principal_id,'seeded','Owner-designated synthetic review site: '+str(site_id))
