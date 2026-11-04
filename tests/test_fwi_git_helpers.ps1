# Requires PowerShell 5.1+, Git, and (for gh paths) a fake gh.cmd shim on PATH.
# FWI-DEVOPS-001 AC-07: safety tests for scripts/fwi-git.ps1.
# All scenarios run inside disposable temporary Git repositories with a bare
# "origin"; the live FWI checkout is never modified. The GitHub CLI is faked
# via a PATH shim so no network/GitHub auth is required.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tests\test_fwi_git_helpers.ps1
$ErrorActionPreference = 'Continue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Helper   = Join-Path $RepoRoot 'scripts\fwi-git.ps1'

if (-not (Test-Path $Helper)) { Write-Host 'FAIL: helper not found.'; exit 1 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Write-Host 'FAIL: git not found.'; exit 1 }

$Script:Pass = 0
$Script:FailCount = 0
$Script:TempRoots = @()
$Script:OrigPath = $env:PATH
$Script:ShimRoot = Join-Path ([IO.Path]::GetTempPath()) ('fwi-helper-shim-' + [guid]::NewGuid().ToString('N'))
$Script:TempRoots += $Script:ShimRoot

function New-TempRepo {
    $root = Join-Path ([IO.Path]::GetTempPath()) ('fwi-helper-test-' + [guid]::NewGuid().ToString('N'))
    $bare = "$root.git-origin"
    New-Item -ItemType Directory -Path $root | Out-Null
    $Script:TempRoots += $root
    $Script:TempRoots += $bare
    git init --bare -b main $bare | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "bare init failed: $bare" }
    git -C $root init -b main | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "init failed: $root" }
    git -C $root config user.email test@example.invalid
    git -C $root config user.name 'FWI Test'
    git -C $root config core.autocrlf false
    Set-Content -Path (Join-Path $root 'notes.txt') -Value 'notes v1'
    git -C $root add notes.txt
    git -C $root commit -m init | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'initial commit failed' }
    git -C $root remote add origin $bare
    git -C $root push -u origin main | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'push main failed' }
    return @{ Root = $root; Bare = $bare }
}

function Invoke-Helper {
    param([string]$RepoPath, [string[]]$HelperArgs)
    Push-Location $RepoPath
    try {
        $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Helper @HelperArgs 2>&1 | Out-String)
        $code = $LASTEXITCODE
    }
    finally { Pop-Location }
    return @{ Code = $code; Output = $out }
}

function Assert-True {
    param([bool]$Cond, [string]$Name, [string]$Detail = '')
    if ($Cond) { $Script:Pass++; Write-Host "  PASS: $Name" -ForegroundColor Green }
    else { $Script:FailCount++; Write-Host "  FAIL: $Name $Detail" -ForegroundColor Red }
}

function Use-GhShim {
    param([string]$Mode)  # 'success' | 'fail-create'
    $dir = Join-Path $Script:ShimRoot $Mode
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    # %2 is the gh subcommand (args are: pr <sub> ...) - view returns PR JSON.
    $lines = @(
        '@echo off',
        'if "%2"=="view" (',
        '  echo {"number":8,"state":"OPEN","isDraft":false,"mergeable":true,"url":"https://example.invalid/fwi/pr/8"}',
        '  exit /b 0',
        ')'
    )
    if ($Mode -eq 'fail-create') { $lines += 'exit /b 1' }
    else { $lines += @('echo https://example.invalid/fwi/pr/8', 'exit /b 0') }
    Set-Content -Path (Join-Path $dir 'gh.cmd') -Value ($lines -join "`r`n") -Encoding ASCII
    $env:PATH = "$dir;$($Script:OrigPath)"
}

try {
    # ---------------------------------------------------------------- S1
    Write-Host "`n[S1] start: dirty tracked file -> refuse, zero mutation" -ForegroundColor Cyan
    $r = New-TempRepo
    Set-Content -Path (Join-Path $r.Root 'notes.txt') -Value 'dirty content'
    $head = (git -C $r.Root rev-parse HEAD)
    $res = Invoke-Helper $r.Root @('start', 'feat/s1')
    Assert-True ($res.Code -ne 0) 'exit nonzero on dirty tracked file'
    Assert-True ((git -C $r.Root branch --show-current).Trim() -eq 'main') 'no branch switch occurred'
    Assert-True ((Get-Content (Join-Path $r.Root 'notes.txt') -Raw).Trim() -eq 'dirty content') 'dirty file content intact'
    Assert-True ([string]::IsNullOrWhiteSpace((git -C $r.Root branch --list 'feat/s1'))) 'no new branch created'
    Assert-True ((git -C $r.Root rev-parse HEAD) -eq $head) 'HEAD unchanged'

    # ---------------------------------------------------------------- S2
    Write-Host "`n[S2] start: untracked FWI-GOV-001_Codex_Task.md -> allowed, preserved" -ForegroundColor Cyan
    $r = New-TempRepo
    Set-Content -Path (Join-Path $r.Root 'FWI-GOV-001_Codex_Task.md') -Value 'jangan disentuh'
    $res = Invoke-Helper $r.Root @('start', 'feat/s2')
    Assert-True ($res.Code -eq 0) 'start succeeds with untracked file present'
    Assert-True ((git -C $r.Root branch --show-current).Trim() -eq 'feat/s2') 'task branch created'
    Assert-True (Test-Path (Join-Path $r.Root 'FWI-GOV-001_Codex_Task.md')) 'untracked file still exists'
    Assert-True ((@(git -C $r.Root status --porcelain) -match 'FWI-GOV-001_Codex_Task.md').Count -gt 0) 'file remains untracked'

    # ---------------------------------------------------------------- S3
    Write-Host "`n[S3] pr: allowlist only; untracked task file never staged/committed" -ForegroundColor Cyan
    Use-GhShim 'success'
    $r = New-TempRepo
    $res = Invoke-Helper $r.Root @('start', 'feat/s3')
    Assert-True ($res.Code -eq 0) 'start ok (S3 setup)'
    Set-Content -Path (Join-Path $r.Root 'notes.txt') -Value 'notes v2'
    Set-Content -Path (Join-Path $r.Root 'FWI-GOV-001_Codex_Task.md') -Value 'jangan disentuh'
    $res = Invoke-Helper $r.Root @('pr', 'docs: allowlist staging test', 'notes.txt', '-NoPrompt')
    Assert-True ($res.Code -eq 0) 'pr succeeds with explicit allowlist'
    $files = @(@(git -C $r.Root --no-pager show --name-only --pretty=format: HEAD) | Where-Object { $_ -and $_.Trim() })
    Assert-True ($files.Count -eq 1 -and $files[0].Trim() -eq 'notes.txt') ("commit contains ONLY allowlisted file (got: $($files -join ','))")
    Assert-True ((Get-Content (Join-Path $r.Root 'FWI-GOV-001_Codex_Task.md') -Raw).Trim() -eq 'jangan disentuh') 'untracked task file content intact'
    Assert-True ((@(git -C $r.Root status --porcelain) -match '\?\? FWI-GOV-001_Codex_Task.md').Count -eq 1) 'task file still untracked after pr'
    Assert-True (-not [string]::IsNullOrWhiteSpace((git -C $r.Bare branch --list 'feat/s3'))) 'branch pushed to origin'

    # ---------------------------------------------------------------- S4
    Write-Host "`n[S4] pr: pre-staged unrelated change -> refused, no commit" -ForegroundColor Cyan
    $r = New-TempRepo
    $res = Invoke-Helper $r.Root @('start', 'feat/s4')
    Assert-True ($res.Code -eq 0) 'start ok (S4 setup)'
    Set-Content -Path (Join-Path $r.Root 'other.txt') -Value 'other v1'
    git -C $r.Root add other.txt
    Set-Content -Path (Join-Path $r.Root 'notes.txt') -Value 'notes v3'
    $head = (git -C $r.Root rev-parse HEAD)
    $res = Invoke-Helper $r.Root @('pr', 'docs: must be refused', 'notes.txt', '-NoPrompt')
    Assert-True ($res.Code -ne 0) 'pr refuses pre-staged content outside allowlist'
    Assert-True ((git -C $r.Root rev-parse HEAD) -eq $head) 'no commit created'
    Assert-True ((@(git -C $r.Root diff --cached --name-only) -contains 'other.txt')) 'pre-staged index left untouched'
    Assert-True ([string]::IsNullOrWhiteSpace((git -C $r.Bare branch --list 'feat/s4'))) 'nothing pushed'

    # ---------------------------------------------------------------- S5
    Write-Host "`n[S5] done -NoPrompt: must NOT merge open PR" -ForegroundColor Cyan
    Use-GhShim 'success'
    $r = New-TempRepo
    Invoke-Helper $r.Root @('start', 'feat/s5') | Out-Null
    Set-Content -Path (Join-Path $r.Root 'notes.txt') -Value 'notes s5'
    Set-Content -Path (Join-Path $r.Root 'FWI-GOV-001_Codex_Task.md') -Value 'jangan disentuh'
    $res = Invoke-Helper $r.Root @('pr', 'docs: s5 setup', 'notes.txt', '-NoPrompt')
    Assert-True ($res.Code -eq 0) 'setup: pr ok (S5)'
    $res = Invoke-Helper $r.Root @('done', '-NoPrompt')
    Assert-True ($res.Code -ne 0) 'done -NoPrompt exits nonzero (no silent merge)'
    Assert-True ((git -C $r.Root branch --show-current).Trim() -eq 'feat/s5') 'no branch switch happened'
    git -C $r.Bare merge-base --is-ancestor feat/s5 main
    Assert-True ($LASTEXITCODE -ne 0) 'branch NOT merged into origin/main'
    Assert-True ($res.Output -match 'NoPrompt') 'guidance message mentions -NoPrompt'

    # ---------------------------------------------------------------- S6
    Write-Host "`n[S6] start: clean repo -> normal success path" -ForegroundColor Cyan
    $r = New-TempRepo
    $res = Invoke-Helper $r.Root @('start', 'feat/s6')
    Assert-True ($res.Code -eq 0) 'start succeeds on clean repo'
    Assert-True ((git -C $r.Root branch --show-current).Trim() -eq 'feat/s6') 'on new task branch'
    Assert-True ([string]::IsNullOrWhiteSpace((git -C $r.Root status --porcelain))) 'working tree clean'

    # ---------------------------------------------------------------- S7
    Write-Host "`n[S7] pr: gh create fails after push -> nonzero, honest state, recovery guidance" -ForegroundColor Cyan
    Use-GhShim 'fail-create'
    $r = New-TempRepo
    Invoke-Helper $r.Root @('start', 'feat/s7') | Out-Null
    Set-Content -Path (Join-Path $r.Root 'notes.txt') -Value 'notes v4'
    $head = (git -C $r.Root rev-parse HEAD)
    $res = Invoke-Helper $r.Root @('pr', 'docs: gh failure path', 'notes.txt', '-NoPrompt')
    Assert-True ($res.Code -ne 0) 'pr reports failure (no false success)'
    Assert-True ($res.Output -match 'gh pr create') 'recovery guidance (gh pr create) printed'
    Assert-True (-not [string]::IsNullOrWhiteSpace((git -C $r.Bare branch --list 'feat/s7'))) 'push DID succeed before gh failure'
    Assert-True ((git -C $r.Root rev-parse HEAD) -ne $head) 'commit exists (honest partial state)'
}
finally {
    $env:PATH = $Script:OrigPath
    foreach ($t in $Script:TempRoots) {
        if (Test-Path $t) { Remove-Item -Recurse -Force $t -ErrorAction SilentlyContinue }
    }
}

Write-Host ("`nSummary: {0} passed, {1} failed" -f $Script:Pass, $Script:FailCount) -ForegroundColor Magenta
if ($Script:FailCount -eq 0) { exit 0 } else { exit 1 }
