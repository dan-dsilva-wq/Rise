# =============================================================================
# SYNC OVERNIGHT SCRIPTS - Re-creates hard links from rise to other projects
# =============================================================================
# Run this after any git operation that might break hard links (checkout, pull, etc.)
# Usage: .\scripts\sync-overnight.ps1
# =============================================================================

$SCRIPT_DIR = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }

$scripts = @("overnight-v3.ps1", "overnight-v3.1.ps1", "overnight-v4.ps1")

$projectDirs = @(
    "C:\Users\dan-d\Projects\Website\daniel-huaiyao\scripts",
    "C:\Users\dan-d\Projects\Website\mathgraph\scripts"
)

foreach ($scriptName in $scripts) {
    $canonical = "$SCRIPT_DIR\$scriptName"
    if (-not (Test-Path $canonical)) {
        Write-Host "SKIP: Canonical file not found: $canonical" -ForegroundColor Yellow
        continue
    }

    foreach ($projDir in $projectDirs) {
        if (-not (Test-Path $projDir)) {
            Write-Host "SKIP: Directory not found: $projDir" -ForegroundColor Yellow
            continue
        }

        $target = "$projDir\$scriptName"

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
}

Write-Host ""
Write-Host "Sync complete." -ForegroundColor Cyan
