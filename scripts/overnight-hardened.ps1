# =============================================================================
# OVERNIGHT AI EXPERIMENT v2.1 - Configurable & Reusable
# =============================================================================
# Usage:
#   .\scripts\overnight-hardened.ps1                           # Default run
#   .\scripts\overnight-hardened.ps1 -MaxLoops 5               # Short test
#   .\scripts\overnight-hardened.ps1 -Goal "Make it awesome"   # Goal mode
#   .\scripts\overnight-hardened.ps1 -UseVision                # Use vision file
#   .\scripts\overnight-hardened.ps1 -DryRun                   # Test without changes
#
# Configuration: Edit project-config.json and product-vision.txt for your project
# =============================================================================

param(
    [string]$TaskFile = "tasks.json",
    [string]$RiskLevel = "low",
    [int]$MaxLoops = 30,
    [string]$Goal = "",
    [switch]$UseVision = $false,
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Continue"

# =============================================================================
# PATHS
# =============================================================================

$SCRIPT_DIR = $PSScriptRoot
$PROJECT_ROOT = (Resolve-Path "$SCRIPT_DIR\..").Path
$CONFIG_FILE = "$SCRIPT_DIR\project-config.json"
$STATE_FILE = "$SCRIPT_DIR\state.json"
$TASK_FILE = "$SCRIPT_DIR\$TaskFile"
$LOG_DIR = "$SCRIPT_DIR\logs"
$REPORT_DIR = "$SCRIPT_DIR\reports"

$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$DATE_STAMP = Get-Date -Format "yyyyMMdd"
$LOG_FILE = "$LOG_DIR\overnight-$DATE_STAMP.log"
$REPORT_FILE = "$REPORT_DIR\overnight-report-$DATE_STAMP.md"

# =============================================================================
# HELPERS
# =============================================================================

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$ts] $Message"
    Write-Host $logMessage -ForegroundColor $Color
    if ($LOG_FILE) { Add-Content -Path $LOG_FILE -Value $logMessage -ErrorAction SilentlyContinue }
}

function Write-Banner {
    param([string]$Text)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Enable-SleepPrevention {
    $code = @'
[DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
    try {
        $sleepUtil = Add-Type -MemberDefinition $code -Name "SleepUtil" -Namespace "Win32" -PassThru -ErrorAction SilentlyContinue
        $sleepUtil::SetThreadExecutionState(0x80000000 -bor 0x00000001 -bor 0x00000002) | Out-Null
        Write-Log "Sleep prevention enabled" "Green"
    } catch {
        Write-Log "Could not disable sleep" "Yellow"
    }
}

function ConvertTo-Hashtable {
    param($InputObject)
    if ($null -eq $InputObject) { return @{} }
    if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
        $collection = @(foreach ($object in $InputObject) { ConvertTo-Hashtable $object })
        return ,$collection
    } elseif ($InputObject -is [PSCustomObject]) {
        $hash = @{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $hash[$property.Name] = ConvertTo-Hashtable $property.Value
        }
        return $hash
    } else {
        return $InputObject
    }
}

# =============================================================================
# CONFIGURATION
# =============================================================================

function Load-ProjectConfig {
    if (-not (Test-Path $CONFIG_FILE)) {
        Write-Log "No project-config.json found - creating default" "Yellow"
        $defaultConfig = @{
            project = @{
                name = "MyProject"
                description = "A software project"
                techStack = "JavaScript"
                visionFile = "product-vision.txt"
            }
            qualityGates = @{
                enabled = $true
                commands = @{
                    typecheck = "npx tsc --noEmit"
                    lint = "npm run lint"
                    build = "npm run build"
                }
            }
            git = @{
                mainBranch = "main"
                branchPrefix = "experimental/overnight"
            }
            safety = @{
                maxFilesPerTask = 3
                maxConsecutiveFailures = 3
                maxConsecutiveNoOps = 3
                blockedPatterns = @(
                    "\.env", "package-lock\.json", "yarn\.lock",
                    "pnpm-lock\.yaml", "\.prisma", "schema\.prisma",
                    "migrations/", "\.secret", "credentials", "node_modules/"
                )
            }
            timing = @{
                pauseSeconds = 30
                maxRetries = 3
            }
        }
        $defaultConfig | ConvertTo-Json -Depth 10 | Set-Content $CONFIG_FILE
        return $defaultConfig
    }
    return Get-Content $CONFIG_FILE -Raw | ConvertFrom-Json | ConvertTo-Hashtable
}

function Load-Vision {
    param($config)
    $visionPath = "$SCRIPT_DIR\$($config.project.visionFile)"
    if (Test-Path $visionPath) {
        return Get-Content $visionPath -Raw
    }
    return ""
}

# =============================================================================
# STATE MANAGEMENT
# =============================================================================

function Initialize-State {
    $state = @{
        startedAt = (Get-Date).ToString("o")
        currentLoop = 0
        completedTasks = @()
        failedTasks = @()
        skippedTasks = @()
        consecutiveFailures = 0
        consecutiveNoOps = 0
        totalCommits = 0
        observations = @()
        reviewRequired = @()
    }
    Save-State $state
    return $state
}

function Load-State {
    if (Test-Path $STATE_FILE) {
        return Get-Content $STATE_FILE -Raw | ConvertFrom-Json | ConvertTo-Hashtable
    }
    return Initialize-State
}

function Save-State {
    param($state)
    $state | ConvertTo-Json -Depth 10 | Set-Content $STATE_FILE
}

function Add-Observation {
    param($state, [string]$observation)
    $loopNum = $state.currentLoop
    $state.observations += "Loop ${loopNum}: $observation"
    Save-State $state
}

# =============================================================================
# TASK QUEUE
# =============================================================================

function Load-Tasks {
    param($config)
    if (-not (Test-Path $TASK_FILE)) {
        Write-Log "No task file found - creating default" "Yellow"
        $defaultTasks = @{
            tasks = @(
                @{ id = "1"; description = "Add hover states to interactive components"; risk = "low"; status = "pending"; maxFiles = 3 }
                @{ id = "2"; description = "Improve error messages in forms"; risk = "low"; status = "pending"; maxFiles = 3 }
                @{ id = "3"; description = "Add loading states to async operations"; risk = "low"; status = "pending"; maxFiles = 3 }
            )
            config = @{
                riskLevel = "low"
                maxFilesPerTask = $config.safety.maxFilesPerTask
            }
        }
        $defaultTasks | ConvertTo-Json -Depth 10 | Set-Content $TASK_FILE
        return $defaultTasks
    }
    return Get-Content $TASK_FILE -Raw | ConvertFrom-Json | ConvertTo-Hashtable
}

function Save-Tasks {
    param($taskData)
    $taskData | ConvertTo-Json -Depth 10 | Set-Content $TASK_FILE
}

function Get-NextTask {
    param($taskData, [string]$riskLevel)
    $riskOrder = @{ "low" = 1; "medium" = 2; "high" = 3 }
    foreach ($task in $taskData.tasks) {
        if ($task.status -eq "pending") {
            $taskRisk = if ($task.risk) { $task.risk } else { "low" }
            if ($riskOrder[$taskRisk] -le $riskOrder[$riskLevel]) {
                return $task
            }
        }
    }
    return $null
}

function Update-TaskStatus {
    param($taskData, [string]$taskId, [string]$status)
    foreach ($task in $taskData.tasks) {
        if ($task.id -eq $taskId) {
            $task.status = $status
            break
        }
    }
    Save-Tasks $taskData
}

# =============================================================================
# QUALITY GATES
# =============================================================================

function Invoke-QualityGate {
    param([string]$name, [string]$command, $config)

    if (-not $config.qualityGates.enabled) { return $true }
    if (-not $command) { return $true }

    Write-Log "Running $name..." "Yellow"
    Push-Location $PROJECT_ROOT
    try {
        $output = Invoke-Expression $command 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "$name passed" "Green"
            return $true
        } else {
            Write-Log "$name FAILED" "Red"
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Invoke-QualityGates {
    param($config)
    Write-Log "Running quality gates..." "Cyan"

    $commands = $config.qualityGates.commands

    if (-not (Invoke-QualityGate "TypeScript" $commands.typecheck $config)) { return $false }
    if (-not (Invoke-QualityGate "Lint" $commands.lint $config)) { return $false }
    if (-not (Invoke-QualityGate "Build" $commands.build $config)) { return $false }

    Write-Log "All quality gates passed!" "Green"
    return $true
}

# =============================================================================
# GIT OPERATIONS
# =============================================================================

function Get-ChangedFiles {
    Push-Location $PROJECT_ROOT
    try {
        $files = git diff --name-only 2>&1
        return $files -split "`n" | Where-Object { $_ -ne "" }
    } finally {
        Pop-Location
    }
}

function Test-FileAllowed {
    param([string]$file, $config)
    foreach ($pattern in $config.safety.blockedPatterns) {
        if ($file -match $pattern) { return $false }
    }
    return $true
}

function Invoke-SmartStaging {
    param($config)
    $changedFiles = Get-ChangedFiles
    $stagedFiles = @()
    $blockedFiles = @()
    $maxFiles = $config.safety.maxFilesPerTask

    Push-Location $PROJECT_ROOT
    try {
        foreach ($file in $changedFiles) {
            if (Test-FileAllowed $file $config) {
                if ($stagedFiles.Count -lt $maxFiles) {
                    git add $file 2>&1 | Out-Null
                    $stagedFiles += $file
                    Write-Log "Staged: $file" "Green"
                } else {
                    Write-Log "Skipped (limit): $file" "Yellow"
                }
            } else {
                $blockedFiles += $file
                Write-Log "Blocked: $file" "Red"
            }
        }
    } finally {
        Pop-Location
    }

    return @{
        staged = $stagedFiles
        blocked = $blockedFiles
        exceededLimit = ($changedFiles.Count -gt $maxFiles)
    }
}

function Invoke-Revert {
    Write-Log "Reverting changes..." "Yellow"
    Push-Location $PROJECT_ROOT
    try {
        git checkout . 2>&1 | Out-Null
        git clean -fd 2>&1 | Out-Null
        Write-Log "Changes reverted" "Green"
    } finally {
        Pop-Location
    }
}

function Invoke-Commit {
    param([string]$message)
    Push-Location $PROJECT_ROOT
    try {
        git commit -m $message 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Committed: $message" "Green"
            return $true
        }
        return $false
    } finally {
        Pop-Location
    }
}

function Get-CommitCount {
    param($config)
    Push-Location $PROJECT_ROOT
    try {
        $mainBranch = $config.git.mainBranch
        $count = git rev-list --count "${mainBranch}..HEAD" 2>&1
        if ($count -match '^\d+$') { return [int]$count }
        return 0
    } finally {
        Pop-Location
    }
}

function Get-CommitsSince {
    param([string]$SinceHash)
    Push-Location $PROJECT_ROOT
    try {
        $logs = git log --oneline "${SinceHash}..HEAD" 2>&1
        if ($logs -and $logs -ne "") {
            $lines = "$logs" -split "`n" | Where-Object { $_.Trim() -ne "" }
            return @($lines)
        }
        return @()
    } finally {
        Pop-Location
    }
}

function Get-FilesSince {
    param([string]$SinceHash)
    Push-Location $PROJECT_ROOT
    try {
        $files = git diff --name-only "${SinceHash}..HEAD" 2>&1
        if ($files -and $files -ne "") {
            $lines = "$files" -split "`n" | Where-Object { $_.Trim() -ne "" }
            return @($lines)
        }
        return @()
    } finally {
        Pop-Location
    }
}

function Write-LoopCompletion {
    param(
        [int]$Loop,
        [array]$Commits,
        [array]$Files,
        [string]$Observation,
        [int]$ElapsedSeconds
    )

    $elapsed = if ($ElapsedSeconds -ge 60) {
        "$([math]::Floor($ElapsedSeconds / 60))m $($ElapsedSeconds % 60)s"
    } else {
        "${ElapsedSeconds}s"
    }

    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Green
    Write-Host "  LOOP $Loop COMPLETED ($elapsed)" -ForegroundColor Green
    Write-Host "  ========================================" -ForegroundColor Green

    # Show what Claude committed
    if ($Commits.Count -gt 0) {
        Write-Host ""
        Write-Host "  Commits:" -ForegroundColor White
        foreach ($c in $Commits) {
            if ($c -notmatch "overnight: Progress") {
                Write-Host "    $c" -ForegroundColor Cyan
            }
        }
    }

    # Show files touched
    if ($Files.Count -gt 0) {
        Write-Host ""
        Write-Host "  Files changed ($($Files.Count)):" -ForegroundColor White
        foreach ($f in $Files) {
            Write-Host "    $f" -ForegroundColor DarkGray
        }
    }

    # Show observation if captured
    if ($Observation) {
        Write-Host ""
        Write-Host "  Observation:" -ForegroundColor DarkCyan
        Write-Host "    $Observation" -ForegroundColor DarkCyan
    }

    Write-Host ""
}

# =============================================================================
# PROMPTS
# =============================================================================

function Get-TaskPrompt {
    param($task, $config)
    $projectName = $config.project.name
    $techStack = $config.project.techStack
    $maxFiles = $config.safety.maxFilesPerTask

    return @"
You are improving $projectName ($techStack).

CURRENT TASK:
$($task.description)

STRICT RULES:
- Maximum $maxFiles files changed
- NO package.json changes (no new dependencies)
- NO database schema changes
- NO .env or secret files

WORKFLOW:
1. Understand what files you need to modify
2. List files BEFORE editing (max $maxFiles)
3. Implement the change
4. Stage files: git add <specific-files>
5. Commit with a clear message

If task requires more than $maxFiles files: output "SKIP: [reason]"
If blocked: output "NOOP: [explanation]"

Focus on quality. Make it work correctly.
"@
}

function Get-GoalPrompt {
    param([string]$goal, [string]$vision, $state, $config)

    $projectName = $config.project.name
    $projectDesc = $config.project.description
    $techStack = $config.project.techStack
    $maxFiles = $config.safety.maxFilesPerTask
    $loopNum = $state.currentLoop

    $observations = $state.observations | Select-Object -Last 5
    $observationText = if ($observations) { $observations -join "`n" } else { "None yet" }

    $visionSection = if ($vision) {
        @"

PRODUCT VISION:
$vision
"@
    } else { "" }

    return @"
You are the overnight AI improving $projectName - $projectDesc ($techStack).
$visionSection

BUSINESS GOAL: $goal

YOUR MISSION (Loop $loopNum):
1. EXPLORE the codebase - read key files to understand what exists
2. Think: "What would make users say WOW?"
3. Pick ONE high-impact improvement
4. Implement it with quality

WHAT MAKES USERS LOVE AN APP:
- Moments of delight (micro-interactions, animations)
- Feeling understood (personalization, smart defaults)
- Trust signals (polish, no bugs, professional feel)
- Reduced friction (fast, intuitive, forgiving)
- Progress visibility (streaks, stats, celebrations)

RECENT OBSERVATIONS:
$observationText

STRICT RULES:
- Maximum $maxFiles files changed
- NO package.json changes
- NO database schema changes
- NO .env or secret files

WORKFLOW:
1. Explore: Read 2-3 key files
2. Decide: Pick highest-impact improvement
3. Implement: Make it excellent
4. Stage: git add <specific-files>
5. Commit: git commit -m "Improve: [what and why]"

If you notice opportunities for later, START with:
OBSERVATION: [what you noticed]

OUTPUT SIGNALS:
- If blocked: "BLOCKED: [reason]"
- If goal complete: "GOAL_COMPLETE"

Think like a founder. Ship something you'd be proud of.
"@
}

# =============================================================================
# REPORT
# =============================================================================

function New-MorningReport {
    param($state, $taskData, $config)

    $projectName = $config.project.name
    $mainBranch = $config.git.mainBranch
    $endTime = Get-Date
    $startTime = [DateTime]::Parse($state.startedAt)
    $duration = $endTime - $startTime

    $completedList = ($state.completedTasks | ForEach-Object { "- [x] Task $_" }) -join "`n"
    if (-not $completedList) { $completedList = "None" }

    $failedList = ($state.failedTasks | ForEach-Object { "- [ ] Task $_" }) -join "`n"
    if (-not $failedList) { $failedList = "None" }

    $observationList = ($state.observations | ForEach-Object { "- $_" }) -join "`n"
    if (-not $observationList) { $observationList = "None recorded" }

    $report = @"
# Overnight Report - $projectName - $(Get-Date -Format "yyyy-MM-dd")

## Summary
- **Started:** $($startTime.ToString("h:mm tt"))
- **Ended:** $($endTime.ToString("h:mm tt"))
- **Duration:** $([math]::Round($duration.TotalHours, 1)) hours
- **Loops:** $($state.currentLoop)
- **Commits:** $($state.totalCommits)

## Completed
$completedList

## Failed
$failedList

## AI Observations
$observationList

## Next Steps
1. Review: ``git log --oneline $mainBranch..HEAD``
2. Diff: ``git diff $mainBranch..HEAD``
3. Merge or cherry-pick

---
*Generated by Overnight AI Experiment v2.1*
"@

    if (-not (Test-Path $REPORT_DIR)) { New-Item -ItemType Directory -Path $REPORT_DIR -Force | Out-Null }
    $report | Set-Content $REPORT_FILE
    Write-Log "Report saved: $REPORT_FILE" "Green"
    return $report
}

# =============================================================================
# MAIN
# =============================================================================

function Start-OvernightExperiment {
    # Load config
    $config = Load-ProjectConfig
    $projectName = $config.project.name
    $mainBranch = $config.git.mainBranch
    $branchPrefix = $config.git.branchPrefix
    $pauseSeconds = $config.timing.pauseSeconds
    $maxRetries = $config.timing.maxRetries
    $maxFailures = $config.safety.maxConsecutiveFailures
    $maxNoOps = $config.safety.maxConsecutiveNoOps

    Write-Banner "OVERNIGHT AI EXPERIMENT v2.1"
    Write-Banner $projectName

    Enable-SleepPrevention
    Set-Location $PROJECT_ROOT

    # Ensure directories
    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
    if (-not (Test-Path $REPORT_DIR)) { New-Item -ItemType Directory -Path $REPORT_DIR -Force | Out-Null }

    # Load vision if requested
    $vision = ""
    if ($UseVision) {
        $vision = Load-Vision $config
        if ($vision) {
            Write-Log "Loaded product vision" "Green"
        } else {
            Write-Log "No vision file found" "Yellow"
        }
    }

    # If using vision and no goal specified, use a default goal
    if ($UseVision -and -not $Goal) {
        $Goal = "Make this the best possible product users will love"
    }

    Write-Log "Project: $projectName" "Cyan"
    Write-Log "Max Loops: $MaxLoops" "Cyan"
    if ($Goal) { Write-Log "Goal Mode: $($Goal.Substring(0, [Math]::Min(50, $Goal.Length)))..." "Cyan" }
    if ($DryRun) { Write-Log "DRY RUN MODE" "Yellow" }

    # Initialize
    $state = Initialize-State
    $taskData = Load-Tasks $config

    # Create branch
    $branch = "$branchPrefix-$TIMESTAMP"
    Write-Log "Creating branch: $branch" "Green"
    git checkout -b $branch 2>&1 | Out-Null

    Write-Log "Starting. Press Ctrl+C to stop." "Yellow"
    Start-Sleep -Seconds 3

    # Main loop
    for ($i = 1; $i -le $MaxLoops; $i++) {
        $state.currentLoop = $i
        Save-State $state
        $loopStartTime = Get-Date

        # Capture HEAD before this loop for diff summary
        Push-Location $PROJECT_ROOT
        $headBefore = git rev-parse HEAD 2>&1
        Pop-Location

        Write-Banner "Loop $i of $MaxLoops"

        # Stop conditions
        if ($state.consecutiveFailures -ge $maxFailures) {
            Write-Log "STOPPING: $maxFailures consecutive failures" "Red"
            break
        }
        if ($state.consecutiveNoOps -ge $maxNoOps) {
            Write-Log "STOPPING: $maxNoOps consecutive no-ops" "Yellow"
            break
        }

        # Build prompt
        if ($Goal) {
            $prompt = Get-GoalPrompt -goal $Goal -vision $vision -state $state -config $config
            $currentTaskId = "goal-$i"
        } else {
            $task = Get-NextTask -taskData $taskData -riskLevel $RiskLevel
            if (-not $task) {
                Write-Log "No more tasks at risk level: $RiskLevel" "Yellow"
                break
            }
            Write-Log "Task: $($task.description)" "Cyan"
            $prompt = Get-TaskPrompt -task $task -config $config
            $currentTaskId = $task.id
            Update-TaskStatus -taskData $taskData -taskId $task.id -status "in_progress"
        }

        # Run Claude
        $success = $false
        $claudeOutput = ""
        for ($retry = 0; $retry -lt $maxRetries; $retry++) {
            try {
                if ($DryRun) {
                    Write-Log "DRY RUN: Would run Claude" "Yellow"
                    $claudeOutput = "DRY RUN"
                    $success = $true
                } else {
                    $claudeOutput = claude --dangerously-skip-permissions --print $prompt 2>&1
                    $success = $true
                }
                break
            } catch {
                Write-Log "Retry $($retry + 1) of $maxRetries..." "Yellow"
                Start-Sleep -Seconds 30
            }
        }

        if (-not $success) {
            Write-Log "Failed after retries" "Red"
            $state.consecutiveFailures++
            Save-State $state
            continue
        }

        # Check output signals
        if ($claudeOutput -match "SKIP:\s*(.+)") {
            Write-Log "Skipped: $($Matches[1])" "Yellow"
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }
        if ($claudeOutput -match "NOOP:\s*(.+)") {
            Write-Log "No-op: $($Matches[1])" "Yellow"
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }
        if ($claudeOutput -match "BLOCKED:\s*(.+)") {
            Write-Log "Blocked: $($Matches[1])" "Yellow"
            Add-Observation $state "Blocked - $($Matches[1])"
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }
        if ($claudeOutput -match "GOAL_COMPLETE") {
            Write-Log "Goal completed!" "Green"
            break
        }
        if ($claudeOutput -match "OBSERVATION:\s*(.+)") {
            Add-Observation $state $Matches[1]
        }

        # Check for changes
        $changedFiles = Get-ChangedFiles
        if ($changedFiles.Count -eq 0) {
            Write-Log "No changes detected" "Yellow"
            $state.consecutiveNoOps++
            Save-State $state
            Start-Sleep -Seconds $pauseSeconds
            continue
        }

        Write-Log "Changes in $($changedFiles.Count) files" "Cyan"

        # Quality gates
        if (-not $DryRun) {
            if (-not (Invoke-QualityGates $config)) {
                Write-Log "Quality gates failed - reverting" "Red"
                Invoke-Revert
                $state.consecutiveFailures++
                Save-State $state
                Start-Sleep -Seconds $pauseSeconds
                continue
            }
        }

        # Stage and commit
        $staging = Invoke-SmartStaging $config
        if ($staging.staged.Count -eq 0) {
            Write-Log "No files staged" "Yellow"
            Invoke-Revert
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }

        $commitMsg = if ($Goal) { "overnight: Goal progress (loop $i)" } else { "overnight: $($task.description)" }

        if (-not $DryRun) {
            if (Invoke-Commit $commitMsg) {
                $state.totalCommits++
                $state.consecutiveFailures = 0
                $state.consecutiveNoOps = 0
                if (-not $Goal) {
                    Update-TaskStatus $taskData $currentTaskId "completed"
                    $state.completedTasks += $currentTaskId
                }
                Write-Log "Loop $i completed" "Green"
            }
        } else {
            Write-Log "DRY RUN: Would commit" "Yellow"
        }

        Save-State $state

        # Detailed loop summary
        $loopElapsed = [math]::Round(((Get-Date) - $loopStartTime).TotalSeconds)
        $commitsSince = Get-CommitsSince $headBefore
        $filesSince = Get-FilesSince $headBefore

        $loopObs = ""
        if ($claudeOutput -match "OBSERVATION:\s*(.+)") {
            $loopObs = $Matches[1]
        }

        Write-LoopCompletion -Loop $i -Commits $commitsSince -Files $filesSince -Observation $loopObs -ElapsedSeconds $loopElapsed

        $commitCount = Get-CommitCount $config
        Write-Host "  Running totals: $commitCount commits | $($state.completedTasks.Count) tasks done" -ForegroundColor DarkGray
        Write-Host ""

        Write-Log "Pausing ${pauseSeconds}s..." "Gray"
        Start-Sleep -Seconds $pauseSeconds
    }

    # Report
    Write-Banner "EXPERIMENT COMPLETE"
    $report = New-MorningReport $state $taskData $config
    Write-Host $report
    Write-Log "Branch: $branch" "Cyan"
}

# =============================================================================
# RUN
# =============================================================================

try {
    Start-OvernightExperiment
} catch {
    Write-Log "Fatal error: $_" "Red"
    try {
        $config = Load-ProjectConfig
        $state = Load-State
        $taskData = Load-Tasks $config
        New-MorningReport $state $taskData $config
    } catch {
        Write-Log "Could not generate report: $_" "Red"
    }
}
