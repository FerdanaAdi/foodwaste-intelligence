# FWI Git workflow helper v0.2 (hardened, FWI-DEVOPS-001).
# Safety contract: full preflight before side effects, explicit staging allowlist,
# -NoPrompt can never approve a merge. See `help` action for usage.
param(
    [Parameter(Position=0)]
    [ValidateSet("start","pr","done","status","help")]
    [string]$Action = "help",

    [Parameter(Position=1)]
    [string]$Value,

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Paths,

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

function Assert-NotMainForWork {
    $branch = Get-CurrentBranch
    if ($branch -eq "main") {
        Fail "Aksi ini tidak dijalankan langsung dari branch main."
    }
}

function Confirm-Action([string]$message) {
    # Generic confirmation for non-merge actions ONLY.
    # Merge uses Confirm-MergeApproval and never inherits -NoPrompt.
    if ($NoPrompt) { return $true }

    $answer = Read-Host "$message [y/N]"
    return $answer -match '^(y|yes)$'
}

function Confirm-MergeApproval {
    # AC-03: merge approval is interactive-only and explicit.
    # -NoPrompt must NEVER approve a merge.
    if ($NoPrompt) { return $false }

    $answer = Read-Host "Setujui MERGE PR ini (merge commit + hapus branch remote)? Ketik 'merge' untuk menyetujui"
    return $answer -eq 'merge'
}

function Get-TrackedChanges {
    return @(git status --porcelain --untracked-files=no)
}

function Show-UntrackedNotice {
    # Untracked files are preserved as-is; never staged automatically by `pr`
    # (pr only stages an explicit allowlist). This notice keeps them visible.
    $untracked = @(git status --porcelain | Where-Object { $_ -like '?? *' })
    if ($untracked.Count -gt 0) {
        Write-Host "`nFile untracked berikut dibiarkan apa adanya (tidak diubah/dihapus; hanya di-stage bila masuk allowlist eksplisit pr):" -ForegroundColor Yellow
        $untracked | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    }
}

function Assert-NoTrackedChanges {
    $tracked = Get-TrackedChanges
    if ($tracked) {
        Write-Host $tracked
        Fail "Ada perubahan tracked (staged/unstaged) yang belum selesai. Commit/stash dahulu. Tidak ada file yang diubah/dihapus oleh helper."
    }
}

function Test-RepoOperationInProgress {
    # Returns markers of an interrupted merge/rebase/cherry-pick/revert.
    $gitDir = (git rev-parse --git-dir).Trim()
    $markers = @('MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply') |
        ForEach-Object { Join-Path $gitDir $_ } |
        Where-Object { Test-Path $_ }
    return @($markers)
}

function Assert-ValidBranchName([string]$Name) {
    if ([string]::IsNullOrWhiteSpace($Name)) {
        Fail 'Gunakan: .\scripts\fwi.cmd start "jenis/nama-branch"'
    }
    if ($Name.StartsWith('-')) {
        Fail "Nama branch tidak boleh diawali '-': $Name"
    }
    git check-ref-format "refs/heads/$Name"
    if ($LASTEXITCODE -ne 0) {
        Fail "Nama branch tidak valid menurut Git: '$Name'."
    }
    if ($Name -eq 'main') {
        Fail "Branch task tidak boleh 'main'."
    }
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
        Fail 'Gunakan: .\scripts\fwi.cmd start "jenis/nama-branch"'
    }

    # AC-01: every check runs BEFORE any switch/pull/fetch (no side effects first).
    Write-Step "Preflight: validasi nama branch"
    Assert-ValidBranchName $Value

    Write-Step "Preflight: kondisi repository"
    $inProgress = Test-RepoOperationInProgress
    if ($inProgress.Count -gt 0) {
        Fail ("Ada operasi Git yang belum selesai: " + ($inProgress -join ', ') + ". Selesaikan/abort dahulu; tidak ada perubahan yang dilakukan.")
    }

    Assert-NoTrackedChanges
    Show-UntrackedNotice

    $existing = git branch --list $Value
    if ($existing) {
        Fail "Branch '$Value' sudah ada secara lokal."
    }

    git show-ref --verify --quiet refs/heads/main
    if ($LASTEXITCODE -ne 0) { Fail "Branch 'main' tidak ditemukan." }

    # --- Preflight lolos; efek samping dimulai di sini. ---
    Write-Step "Pindah ke main dan sinkronisasi"
    git switch main
    if ($LASTEXITCODE -ne 0) { Fail "Gagal pindah ke main." }

    git fetch --prune
    if ($LASTEXITCODE -ne 0) { Fail "git fetch --prune gagal." }

    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail "git pull gagal atau membutuhkan merge manual." }

    $remoteExisting = git branch -r --list "origin/$Value"
    if ($remoteExisting) {
        Fail "Branch remote 'origin/$Value' sudah ada. Pilih nama lain atau selaraskan dahulu."
    }

    Write-Step "Membuat branch $Value"
    git switch -c $Value
    if ($LASTEXITCODE -ne 0) { Fail "Gagal membuat branch." }

    Show-RepoStatus
}

function Get-PrAllowlist {
    # AC-02: explicit path allowlist; normalize to git-style forward slashes.
    return @($Paths | Where-Object { $_ -and $_ -ne '--' } | ForEach-Object { ($_.Trim() -replace '\\', '/') })
}

function Create-FwiPr {
    Assert-NotMainForWork

    $branch = Get-CurrentBranch

    # AC-02: broad `git add -A` removed; explicit allowlist required.
    $paths = Get-PrAllowlist
    if ($paths.Count -eq 0) {
        Fail @"
pr membutuhkan allowlist path eksplisit (perubahan v0.2: 'git add -A' dihapus).
Contoh: .\scripts\fwi.cmd pr "pesan commit" path/ke/file1.md path/ke/file2.py
"@
    }

    foreach ($p in $paths) {
        if (-not (Test-Path $p)) { Fail "Path allowlist tidak ditemukan: $p" }
    }

    # AC-02: pre-staged content outside the allowlist must not sneak into the commit.
    $stagedBefore = @(git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { Fail "Gagal membaca index (git diff --cached)." }
    $outside = @($stagedBefore | Where-Object { $paths -notcontains $_ })
    if ($outside.Count -gt 0) {
        Fail @"
Ada file yang sudah staged di luar allowlist: $($outside -join ', ')
Unstage dahulu: git restore --staged <file> (atau tambahkan ke allowlist secara eksplisit).
Tidak ada commit yang dibuat.
"@
    }

    Write-Step "Perubahan yang akan di-stage dan di-commit (HANYA allowlist)"
    git status --short -- $paths
    if ($LASTEXITCODE -ne 0) { Fail "Gagal membaca status allowlist." }

    Invoke-FwiTests

    if (-not (Confirm-Action "Stage HANYA file allowlist di atas, commit, push, dan buat PR?")) {
        Fail "Dibatalkan oleh pengguna."
    }

    Write-Step "Stage allowlist"
    git add -- $paths
    if ($LASTEXITCODE -ne 0) { Fail "git add gagal." }

    # Safety re-verify: staged set must equal the allowlist.
    $stagedNow = @(git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0) { Fail "Gagal memverifikasi index." }
    $sneaked = @($stagedNow | Where-Object { $paths -notcontains $_ })
    if ($sneaked.Count -gt 0) {
        Fail "Kesalahan internal: terdapat file staged di luar allowlist ($($sneaked -join ', ')); commit dibatalkan."
    }
    if ($stagedNow.Count -eq 0) {
        Fail "Tidak ada perubahan pada allowlist yang bisa di-commit."
    }

    $commitMessage = $Value
    if (-not $commitMessage) {
        if ($NoPrompt) { Fail "Commit message wajib (argumen ke-2) saat -NoPrompt." }
        $commitMessage = Read-Host "Commit message"
    }
    if (-not $commitMessage) { Fail "Commit message wajib diisi." }

    Write-Step "Commit"
    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) { Fail "Commit gagal." }

    Write-Step "Push branch"
    git push -u origin HEAD
    if ($LASTEXITCODE -ne 0) { Fail "Push gagal. Commit lokal tetap aman; perbaiki remote lalu push manual." }

    $gh = Get-GhCommand

    Write-Step "Membuat Pull Request"
    & $gh pr create --base main --fill
    if ($LASTEXITCODE -ne 0) {
        # AC-04: honest partial-failure reporting with recovery guidance.
        Fail @"
Pembuatan PR GAGAL, tetapi commit dan push SUDAH berhasil di remote branch: $branch
Pemulihan manual (jangan hapus branch remote):
  gh pr create --base main --head $branch --fill
  atau gunakan URL "Create a pull request" yang dicetak git push di atas.
"@
    }

    Write-Step "Selesai"
    git status --short --branch
}

function Finish-FwiTask {
    $branch = Get-CurrentBranch
    if ($branch -eq "main") {
        Write-Step "Sudah berada di main; sinkronisasi saja"
        Assert-NoTrackedChanges
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) { Fail "git pull gagal." }
        git fetch --prune
        if ($LASTEXITCODE -ne 0) { Fail "git fetch --prune gagal." }
        Show-RepoStatus
        return
    }

    Assert-NoTrackedChanges
    Show-UntrackedNotice

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

            # AC-03: -NoPrompt must never approve a merge.
            if ($NoPrompt) {
                Fail @"
-NoPrompt tidak dapat menyetujui merge; TIDAK ada merge yang dijalankan.
Jalankan ulang tanpa -NoPrompt untuk persetujuan interaktif, atau merge melalui GitHub UI.
"@
            }
            if (-not (Confirm-MergeApproval)) {
                Fail "Dibatalkan: merge tidak disetujui."
            }

            Write-Step "Merge PR"
            & $gh pr merge --merge --delete-branch
            if ($LASTEXITCODE -ne 0) {
                Fail "Merge PR gagal. Periksa review/checks/conflict di GitHub."
            }
        }
        elseif ($pr.state -eq "MERGED") {
            # AC-03: already-merged PR syncs without forcing a new merge.
            Write-Host "PR sudah merged; lanjut sinkronisasi tanpa merge baru." -ForegroundColor Yellow
        }
        else {
            Write-Host "PR state=$($pr.state); tidak ada aksi merge." -ForegroundColor Yellow
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
            if ($LASTEXITCODE -ne 0) { Fail "Gagal menghapus branch lokal." }
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

FWI Git Workflow Helper v0.2 (hardened, FWI-DEVOPS-001)

Mulai task:
  .\scripts\fwi.cmd start "jenis/nama-branch"
  - Preflight PENUH sebelum efek samping apa pun: validasi nama branch,
    deteksi merge/rebase/cherry-pick yang belum selesai, perubahan tracked,
    dan nama branch yang sudah ada (lokal/remote).
  - Perubahan tracked (staged/unstaged) => ditolak; file TIDAK diubah/dihapus helper.
  - File untracked dibiarkan utuh dan tidak pernah di-stage otomatis.

Buat commit + push + PR:
  .\scripts\fwi.cmd pr "pesan commit" path1 path2 [pathN]
  - PERUBAHAN v0.2: 'git add -A' DIHAPUS. Hanya path allowlist eksplisit yang di-stage.
  - File yang sudah staged di luar allowlist => ditolak, tidak ikut ter-commit.
  - Preview status allowlist selalu ditampilkan sebelum staging.
  - -NoPrompt melewati konfirmasi pr (allowlist = persetujuan eksplisit),
    tetapi TIDAK PERNAH menyetujui merge.

Selesaikan PR + sinkron main:
  .\scripts\fwi.cmd done
  - Merge hanya dengan persetujuan interaktif (ketik 'merge').
  - done -NoPrompt TIDAK akan melakukan merge (gagal dengan panduan).
  - PR yang sudah merged tetap bisa disinkronkan tanpa merge baru.

Status cepat:
  .\scripts\fwi.cmd status

Opsi:
  -SkipTests   Lewati unit tests saat membuat PR
  -NoPrompt    Hilangkan prompt konfirmasi non-merge (tidak disarankan);
               tidak pernah menyetujui merge.

"@
    }
}
