# =============================================================================
# SYNC OVERNIGHT SCRIPTS - Re-creates hard links from rise to other projects
# =============================================================================
# Run this after any git operation that might break hard links (checkout, pull, etc.)
# Usage: .\scripts\sync-overnight.ps1
# =============================================================================

$SCRIPT_DIR = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }

$canonical = "$SCRIPT_DIR\overnight-v3.ps1"

$targets = @(
    "C:\Users\dan-d\Projects\Website\daniel-huaiyao\scripts\overnight-v3.ps1",
    "C:\Users\dan-d\Projects\Website\mathgraph\scripts\overnight-v3.ps1"
)

if (-not (Test-Path $canonical)) {
    Write-Host "ERROR: Canonical file not found: $canonical" -ForegroundColor Red
    exit 1
}

foreach ($target in $targets) {
    $targetDir = Split-Path -Parent $target
    if (-not (Test-Path $targetDir)) {
        Write-Host "SKIP: Directory not found: $targetDir" -ForegroundColor Yellow
        continue
    }

    # Check if already linked (same content = same hash)
    if (Test-Path $target) {
        $canonHash = (Get-FileHash $canonical -Algorithm MD5).Hash
        $targetHash = (Get-FileHash $target -Algorithm MD5).Hash
        if ($canonHash -eq $targetHash) {
            Write-Host "OK: $target (already in sync)" -ForegroundColor Green
            continue
        }
        Remove-Item $target -Force
    }

    cmd /c "mklink /H `"$target`" `"$canonical`""
    if ($LASTEXITCODE -eq 0) {
        Write-Host "LINKED: $target" -ForegroundColor Green
    } else {
        # Fallback: copy if hard link fails
        Copy-Item $canonical $target -Force
        Write-Host "COPIED: $target (hard link failed, used copy)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Sync complete." -ForegroundColor Cyan
