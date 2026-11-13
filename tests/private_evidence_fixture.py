"""Private ACL setup only for newly owned disposable test directories."""
def secure_test_root(path):
 """Protect only pytest's newly owned disposable directory; never a configured live root."""
 import os,subprocess
 if os.name!='nt':path.chmod(0o700);return
 script=r"""
$ErrorActionPreference='Stop'
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetOwner($user)
$acl.SetAccessRuleProtection($true,$false)
foreach ($sid in @($user.Value,'S-1-5-18','S-1-5-32-544')) {
 $identity=New-Object System.Security.Principal.SecurityIdentifier($sid)
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($rule)
}
[System.IO.Directory]::SetAccessControl($env:FWI_STORAGE_ACL_PATH,$acl)
"""
 subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],env={**os.environ,'FWI_STORAGE_ACL_PATH':str(path)},capture_output=True,check=True,timeout=10)
