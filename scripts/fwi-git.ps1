param(
    [Parameter(Position=0)]
    [ValidateSet("start","pr","done","status","help")]
    [string]$Action = "help",

    [Parameter(Position=1)]
    [string]$Value,

    [switch]$SkipTests,
    [switch]$NoPrompt
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Fail($msg) {
    Write-Host "`nERROR: $msg" -ForegroundColor Red
    exit 1
}

function Get-GhCommand {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) { return $gh.Source }

    $fallbacks = @(
        "C:\Program Files\GitHub CLI\gh.exe",
        "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe"
    )

    foreach ($candidate in $fallbacks) {
        if (Test-Path $candidate) { return $candidate }
    }

    Fail "GitHub CLI (gh) tidak ditemukan. Instal/login GitHub CLI terlebih dahulu."
}

function Assert-GitRepo {
    git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        Fail "Folder aktif bukan Git repository."
    }
}

function Get-CurrentBranch {
    return (git branch --show-current).Trim()
}

function Assert-CleanWorkingTree {
    $dirty = git status --porcelain
    if ($dirty) {
        Write-Host $dirty
        Fail "Working tree belum bersih. Commit/stash/periksa perubahan terlebih dahulu."
    }
}

function Assert-NotMainForWork {
    $branch = Get-CurrentBranch
    if ($branch -eq "main") {
        Fail "Aksi ini tidak dijalankan langsung dari branch main."
    }
}

function Confirm-Action([string]$message) {
    if ($NoPrompt) { return $true }

    $answer = Read-Host "$message [y/N]"
    return $answer -match '^(y|yes)$'
}

function Show-RepoStatus {
    Write-Step "Repository status"
    git status --short --branch

    Write-Step "Recent commits"
    git log --oneline -5
}

function Invoke-FwiTests {
    if ($SkipTests) {
        Write-Host "Tests dilewati karena -SkipTests digunakan." -ForegroundColor Yellow
        return
    }

    if ((Test-Path "tests") -and (Test-Path "src")) {
        Write-Step "Menjalankan unit tests FWI"
        $oldPythonPath = $env:PYTHONPATH
        try {
            $env:PYTHONPATH = "src"
            python -B -m unittest discover -s tests -v
            if ($LASTEXITCODE -ne 0) {
                Fail "Unit tests gagal. PR dibatalkan."
            }
        }
        finally {
            $env:PYTHONPATH = $oldPythonPath
        }
    }
    else {
        Write-Host "Tidak menemukan src/ + tests/; test otomatis dilewati." -ForegroundColor Yellow
    }
}

function Start-FwiTask {
    if (-not $Value) {
        Fail 'Gunakan: .\scripts\fwi-git.ps1 start "jenis/nama-branch"'
    }

    Write-Step "Memastikan main bersih dan terbaru"
    git switch main
    if ($LASTEXITCODE -ne 0) { Fail "Gagal pindah ke main." }

    Assert-CleanWorkingTree

    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail "git pull gagal atau membutuhkan merge manual." }

    git fetch --prune
    if ($LASTEXITCODE -ne 0) { Fail "git fetch --prune gagal." }

    $existing = git branch --list $Value
    if ($existing) {
        Fail "Branch '$Value' sudah ada secara lokal."
    }

    Write-Step "Membuat branch $Value"
    git switch -c $Value
    if ($LASTEXITCODE -ne 0) { Fail "Gagal membuat branch." }

    Show-RepoStatus
}

function Create-FwiPr {
    Assert-NotMainForWork

    $branch = Get-CurrentBranch
    $changes = git status --porcelain

    if (-not $changes) {
        Fail "Tidak ada perubahan untuk di-commit."
    }

    Write-Step "Perubahan yang akan masuk commit"
    git status --short

    Invoke-FwiTests

    if (-not (Confirm-Action "Stage SEMUA perubahan di atas, commit, push, dan buat PR?")) {
        Fail "Dibatalkan oleh pengguna."
    }

    Write-Step "Stage perubahan"
    git add -A

    $commitMessage = $Value
    if (-not $commitMessage) {
        $commitMessage = Read-Host "Commit message"
    }
    if (-not $commitMessage) {
        Fail "Commit message wajib diisi."
    }

    Write-Step "Commit"
    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) { Fail "Commit gagal." }

    Write-Step "Push branch"
    git push -u origin HEAD
    if ($LASTEXITCODE -ne 0) { Fail "Push gagal." }

    $gh = Get-GhCommand

    Write-Step "Membuat Pull Request"
    & $gh pr create --base main --fill
    if ($LASTEXITCODE -ne 0) {
        Fail "Pembuatan PR gagal. Commit dan push tetap aman di remote branch."
    }

    Write-Step "Selesai"
    git status --short --branch
}

function Finish-FwiTask {
    $branch = Get-CurrentBranch
    if ($branch -eq "main") {
        Write-Step "Sudah berada di main; sinkronisasi saja"
        Assert-CleanWorkingTree
        git pull --ff-only
        git fetch --prune
        Show-RepoStatus
        return
    }

    Assert-CleanWorkingTree

    $gh = Get-GhCommand

    Write-Step "Memeriksa PR branch $branch"
    $prJson = & $gh pr view --json number,state,isDraft,mergeable,url 2>$null
    $hasPr = ($LASTEXITCODE -eq 0 -and $prJson)

    if ($hasPr) {
        $pr = $prJson | ConvertFrom-Json
        Write-Host "PR #$($pr.number): $($pr.url)"
        Write-Host "State=$($pr.state), Draft=$($pr.isDraft), Mergeable=$($pr.mergeable)"

        if ($pr.state -eq "OPEN") {
            if ($pr.isDraft) {
                Fail "PR masih draft. Ubah menjadi ready for review sebelum merge."
            }

            if (-not (Confirm-Action "Merge PR dengan merge commit lalu hapus branch remote?")) {
                Fail "Dibatalkan oleh pengguna."
            }

            Write-Step "Merge PR"
            & $gh pr merge --merge --delete-branch
            if ($LASTEXITCODE -ne 0) {
                Fail "Merge PR gagal. Periksa review/checks/conflict di GitHub."
            }
        }
    }
    else {
        Write-Host "PR aktif tidak ditemukan. Akan cek apakah branch sudah merged ke origin/main." -ForegroundColor Yellow
    }

    Write-Step "Sinkronisasi main"
    git switch main
    if ($LASTEXITCODE -ne 0) { Fail "Gagal pindah ke main." }

    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail "Gagal sinkronisasi main." }

    git fetch --prune
    if ($LASTEXITCODE -ne 0) { Fail "git fetch --prune gagal." }

    $localBranchExists = git branch --list $branch
    if ($localBranchExists) {
        git merge-base --is-ancestor $branch origin/main
        if ($LASTEXITCODE -eq 0) {
            Write-Step "Menghapus branch lokal yang sudah merged"
            git branch -d $branch
        }
        else {
            Write-Host "Branch lokal '$branch' belum terbukti merged ke origin/main; tidak dihapus." -ForegroundColor Yellow
        }
    }

    Write-Step "Status akhir"
    git status --short --branch
}

Assert-GitRepo

switch ($Action) {
    "start"  { Start-FwiTask }
    "pr"     { Create-FwiPr }
    "done"   { Finish-FwiTask }
    "status" { Show-RepoStatus }
    "help"   {
        Write-Host @"

FWI Git Workflow Helper v0.1

Mulai task:
  .\scripts\fwi-git.ps1 start "docs/adr-database"

Buat commit + push + PR:
  .\scripts\fwi-git.ps1 pr "docs: add database ADR"

  Default:
  - menampilkan semua perubahan
  - menjalankan unittest bila src/ dan tests/ tersedia
  - meminta konfirmasi sebelum git add -A
  - push branch aktif
  - membuat PR ke main

Selesaikan PR + sinkron main:
  .\scripts\fwi-git.ps1 done

Status cepat:
  .\scripts\fwi-git.ps1 status

Opsi:
  -SkipTests   Lewati unit tests saat membuat PR
  -NoPrompt    Hilangkan prompt konfirmasi (tidak disarankan untuk penggunaan normal)

"@
    }
}
