"""Owner-approved synthetic-only master/file/approval extensions. No numeric correction."""
import hashlib
import os
import subprocess
from pathlib import Path
from uuid import UUID,uuid4
from sqlalchemy import select
from fwi.application import security,master,evidence_store,review_store
from fwi.infrastructure.database.models import (MasterNamespaceApproval,MasterAdministration,ReviewAuthority,
    EvidenceReference,EvidenceFile,CorrectionProposal,ProposalApproval)
MAX_FILE_BYTES=10*1024*1024
TYPES={'application/pdf':b'%PDF-','image/png':b'\x89PNG\r\n\x1a\n','image/jpeg':b'\xff\xd8\xff'}


def master_namespaces(access):
    grants=set(access.session.scalars(select(MasterAdministration.namespace).where(MasterAdministration.principal_id==access.principal.principal_id)))
    return dict(master_namespaces=sorted(grants),review_sites=[str(s) for s in access.session.scalars(select(ReviewAuthority.site_id).where(ReviewAuthority.principal_id==access.principal.principal_id))])


def append_master(access,values):
    namespace=values['namespace']
    if namespace not in master.provisional_namespaces():raise security.Denied(403)
    grant=access.session.get(MasterAdministration,(access.principal.principal_id,namespace))
    approved=access.session.scalar(select(MasterNamespaceApproval).where(MasterNamespaceApproval.namespace==namespace).with_for_update())
    if grant is None or approved is None:raise security.Denied(403)
    from fwi.infrastructure.database.models import MasterReference
    current=access.session.scalar(select(MasterReference).where(MasterReference.namespace==namespace,MasterReference.code==values['code']).order_by(MasterReference.version.desc()))
    expected=values['expected_version']
    if (current.version if current else 0)!=expected:raise security.Denied(409)
    record=master.insert_reference(lambda:access.session,dict(namespace=namespace,code=values['code'],version=expected+1,
        status=values['status'],label=values['label'],definition=values.get('definition'),note=values['reason']+'; source: '+approved.source_ref,
        changed_by=str(access.principal.principal_id),changed_at=security.now(),supersedes_version=expected or None),access=access)
    security.security_audit(access.session,access.principal.principal_id,'master_references',record['reference_id'],'version_created',values['reason'])
    return record


def private_root():
    raw=Path(os.environ.get('FWI_EVIDENCE_ROOT',''))
    if not raw.is_absolute() or raw.is_symlink() or not raw.is_dir():raise security.Denied(503)
    root=raw.resolve();repo=Path(__file__).resolve().parents[3]
    if root.is_relative_to(repo) or repo.is_relative_to(root):raise security.Denied(503)
    if os.name == 'nt':
        # Inspect the real owner/DACL; a configured path is not proof of privacy.
        script = r"""
$ErrorActionPreference='Stop'
$acl=[System.IO.Directory]::GetAccessControl($env:FWI_STORAGE_ACL_PATH)
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed=@($user,'S-1-5-18','S-1-5-32-544')
$owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
if ($owner -notin $allowed) { exit 1 }
$rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])
$own=$false
foreach ($rule in $rules) {
 if ($rule.AccessControlType -eq 'Allow') {
  if ($rule.IdentityReference.Value -notin $allowed) { exit 1 }
  if ($rule.IdentityReference.Value -eq $user) { $own=$true }
 }
}
if (-not $own) { exit 1 }
"""
        try:
            result=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],
                env={**os.environ,'FWI_STORAGE_ACL_PATH':str(root)},capture_output=True,timeout=10)
        except (OSError,subprocess.TimeoutExpired):
            raise security.Denied(503) from None
        if result.returncode:raise security.Denied(503)
    elif root.stat().st_mode & 0o077:raise security.Denied(503)
    return root


def evidence_target(access,evidence_id,write=False):
    row=access.session.scalar(select(EvidenceReference).where(EvidenceReference.evidence_id==evidence_id).with_for_update())
    if row is None:raise security.Denied(404)
    scope=evidence_store._target_scope(access.session,row.target_kind,row.target_id)
    if scope is None:raise security.Denied(404)
    security.permit(access,scope[1],'event.create' if write else 'event.read',conceal=True)
    return row


def store_file(access,evidence_id,content,media_type,root):
    row=evidence_target(access,evidence_id,True)
    if row.kind!='attachment':raise security.Denied(409)
    if access.session.get(EvidenceFile,evidence_id) is not None:raise security.Denied(409)
    if media_type not in TYPES or not content.startswith(TYPES[media_type]) or not 0<len(content)<=MAX_FILE_BYTES:raise security.Denied(400)
    identifier=uuid4();path=root/identifier.hex
    with path.open('xb') as stream:
        stream.write(content);stream.flush();os.fsync(stream.fileno())
    record=EvidenceFile(evidence_id=evidence_id,file_id=identifier,sha256=hashlib.sha256(content).hexdigest(),size_bytes=len(content),media_type=media_type,actor_id=access.principal.principal_id,recorded_at=security.now())
    try:
        access.session.add(record);access.session.flush()
        security.security_audit(access.session,access.principal.principal_id,'evidence_files',identifier,'stored','private synthetic evidence; sha256:'+record.sha256)
    except BaseException:
        # No commit has been attempted yet; this new private file has no committed reference.
        path.unlink(missing_ok=True)
        raise
    return {'evidence_id':str(evidence_id),'file_id':str(identifier),'sha256':record.sha256,'size_bytes':len(content),'media_type':media_type},path


def read_file(access,evidence_id):
    evidence_target(access,evidence_id)
    record=access.session.get(EvidenceFile,evidence_id)
    if record is None:raise security.Denied(404)
    path=private_root()/record.file_id.hex
    if not path.is_file() or path.is_symlink():raise security.Denied(503)
    with path.open('rb') as stream:content=stream.read(MAX_FILE_BYTES+1)
    if len(content)!=record.size_bytes or hashlib.sha256(content).hexdigest()!=record.sha256:raise security.Denied(503)
    return content,record.media_type,str(record.file_id)


def approve_proposal(access,identifier,expected_version,expected_revision,reason):
    proposal=access.session.scalar(select(CorrectionProposal).where(CorrectionProposal.correction_record_id==identifier).with_for_update())
    if proposal is None:raise security.Denied(404)
    scope=review_store._target_scope(access.session,proposal.target_kind,proposal.target_id)
    if scope is None:raise security.Denied(404)
    security.permit(access,scope[1],'event.read',conceal=True)
    if access.session.get(ReviewAuthority,(access.principal.principal_id,scope[1])) is None:raise security.Denied(403)
    if proposal.actor_id==str(access.principal.principal_id):raise security.Denied(403)
    if expected_version!=1 or expected_revision!=0 or access.session.scalar(select(ProposalApproval).where(ProposalApproval.correction_record_id==identifier)) is not None:raise security.Denied(409)
    approval=ProposalApproval(correction_record_id=identifier,proposal_version=1,decision_revision=1,actor_id=access.principal.principal_id,reason=reason,recorded_at=security.now())
    access.session.add(approval);access.session.flush()
    security.security_audit(access.session,access.principal.principal_id,'proposal_approvals',approval.approval_id,'approved_prototype',reason)
    return dict(approval_id=str(approval.approval_id),proposal_version=1,decision_revision=1,status='approved_prototype',applied=False)
