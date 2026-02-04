# =============================================================================
# OVERNIGHT AI EXPERIMENT v2.0 - Hardened & Goal-Oriented
# =============================================================================
# Usage:
#   .\scripts\overnight-hardened.ps1                           # Default run
#   .\scripts\overnight-hardened.ps1 -TaskFile "my-tasks.json" # Custom tasks
#   .\scripts\overnight-hardened.ps1 -RiskLevel "medium"       # Medium risk
#   .\scripts\overnight-hardened.ps1 -MaxLoops 5               # Short test
#   .\scripts\overnight-hardened.ps1 -Goal "Add dark mode"     # Goal mode
# =============================================================================

param(
    [string]$TaskFile = "tasks.json",
    [string]$RiskLevel = "low",
    [int]$MaxLoops = 30,
    [string]$Goal = "",
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Continue"

# =============================================================================
# CONFIGURATION
# =============================================================================

$SCRIPT_DIR = $PSScriptRoot
$PROJECT_ROOT = (Resolve-Path "$SCRIPT_DIR\..").Path
$STATE_FILE = "$SCRIPT_DIR\state.json"
$TASK_FILE = "$SCRIPT_DIR\$TaskFile"
$LOG_DIR = "$SCRIPT_DIR\logs"
$REPORT_DIR = "$SCRIPT_DIR\reports"
$PROMPT_DIR = "$SCRIPT_DIR\prompts"

$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$DATE_STAMP = Get-Date -Format "yyyyMMdd"
$LOG_FILE = "$LOG_DIR\overnight-$DATE_STAMP.log"
$REPORT_FILE = "$REPORT_DIR\overnight-report-$DATE_STAMP.md"

$BRANCH = "experimental/overnight-$TIMESTAMP"
$MAIN_BRANCH = "master"
$PAUSE_SECONDS = 30
$MAX_RETRIES = 3

# Stop conditions
$MAX_CONSECUTIVE_FAILURES = 3
$MAX_CONSECUTIVE_NOOPS = 3

# =============================================================================
# HELPERS
# =============================================================================

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage -ForegroundColor $Color
    Add-Content -Path $LOG_FILE -Value $logMessage
}

function Write-Banner {
    param([string]$Text)
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
}

# Prevent system sleep
function Enable-SleepPrevention {
    $code = @'
[DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
    $ES_CONTINUOUS = 0x80000000
    $ES_SYSTEM_REQUIRED = 0x00000001
    $ES_DISPLAY_REQUIRED = 0x00000002
    try {
        $sleepUtil = Add-Type -MemberDefinition $code -Name "SleepUtil" -Namespace "Win32" -PassThru -ErrorAction SilentlyContinue
        $sleepUtil::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_DISPLAY_REQUIRED) | Out-Null
        Write-Log "Sleep prevention enabled" "Green"
    } catch {
        Write-Log "Could not disable sleep - consider adjusting power settings" "Yellow"
    }
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
        return Get-Content $STATE_FILE | ConvertFrom-Json -AsHashtable
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
# TASK QUEUE MANAGEMENT
# =============================================================================

function Load-Tasks {
    if (-not (Test-Path $TASK_FILE)) {
        Write-Log "No task file found at $TASK_FILE - creating default" "Yellow"
        $defaultTasks = @{
            tasks = @(
                @{ id = "1"; description = "Add hover states to interactive components"; risk = "low"; status = "pending"; maxFiles = 3 }
                @{ id = "2"; description = "Improve error messages in forms"; risk = "low"; status = "pending"; maxFiles = 3 }
                @{ id = "3"; description = "Add aria-labels to buttons and links"; risk = "low"; status = "pending"; maxFiles = 3 }
                @{ id = "4"; description = "Add loading skeletons to async content"; risk = "low"; status = "pending"; maxFiles = 3 }
                @{ id = "5"; description = "Improve mobile touch targets"; risk = "low"; status = "pending"; maxFiles = 3 }
            )
            config = @{
                riskLevel = "low"
                allowSchemaChanges = $false
                allowDependencyChanges = $false
                maxFilesPerTask = 3
            }
        }
        $defaultTasks | ConvertTo-Json -Depth 10 | Set-Content $TASK_FILE
        return $defaultTasks
    }
    return Get-Content $TASK_FILE | ConvertFrom-Json -AsHashtable
}

function Save-Tasks {
    param($taskData)
    $taskData | ConvertTo-Json -Depth 10 | Set-Content $TASK_FILE
}

function Get-NextTask {
    param($taskData, [string]$riskLevel)

    foreach ($task in $taskData.tasks) {
        if ($task.status -eq "pending") {
            # Filter by risk level
            $taskRisk = if ($task.risk) { $task.risk } else { "low" }
            $riskOrder = @{ "low" = 1; "medium" = 2; "high" = 3 }

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

function Test-TypeCheck {
    Write-Log "Running TypeScript check..." "Yellow"

    Push-Location $PROJECT_ROOT
    try {
        $output = npx tsc --noEmit 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Log "TypeScript check passed" "Green"
            return $true
        } else {
            Write-Log "TypeScript check FAILED" "Red"
            Write-Log $output "Red"
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Test-Lint {
    Write-Log "Running lint check..." "Yellow"

    Push-Location $PROJECT_ROOT
    try {
        $output = npm run lint 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Log "Lint check passed" "Green"
            return $true
        } else {
            Write-Log "Lint check FAILED" "Red"
            Write-Log $output "Red"
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Test-Build {
    Write-Log "Running build check..." "Yellow"

    Push-Location $PROJECT_ROOT
    try {
        $output = npm run build 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -eq 0) {
            Write-Log "Build check passed" "Green"
            return $true
        } else {
            Write-Log "Build check FAILED" "Red"
            Write-Log $output "Red"
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Invoke-QualityGates {
    Write-Log "Running quality gates..." "Cyan"

    if (-not (Test-TypeCheck)) {
        return $false
    }

    if (-not (Test-Lint)) {
        return $false
    }

    if (-not (Test-Build)) {
        return $false
    }

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
    param([string]$file)

    # Blocked patterns
    $blockedPatterns = @(
        "\.env",
        "\.env\.",
        "package-lock\.json",
        "yarn\.lock",
        "pnpm-lock\.yaml",
        "\.prisma",
        "schema\.prisma",
        "migrations/",
        "\.secret",
        "credentials",
        "node_modules/"
    )

    foreach ($pattern in $blockedPatterns) {
        if ($file -match $pattern) {
            return $false
        }
    }
    return $true
}

function Invoke-SmartStaging {
    param($taskData)

    $changedFiles = Get-ChangedFiles
    $stagedFiles = @()
    $blockedFiles = @()
    $maxFiles = $taskData.config.maxFilesPerTask

    Push-Location $PROJECT_ROOT
    try {
        foreach ($file in $changedFiles) {
            if (Test-FileAllowed $file) {
                if ($stagedFiles.Count -lt $maxFiles) {
                    git add $file 2>&1 | Out-Null
                    $stagedFiles += $file
                    Write-Log "Staged: $file" "Green"
                } else {
                    Write-Log "Skipped (file limit): $file" "Yellow"
                }
            } else {
                $blockedFiles += $file
                Write-Log "Blocked (sensitive): $file" "Red"
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
    Push-Location $PROJECT_ROOT
    try {
        $count = git rev-list --count "$MAIN_BRANCH..HEAD" 2>&1
        if ($count -match '^\d+$') {
            return [int]$count
        }
        return 0
    } finally {
        Pop-Location
    }
}

# =============================================================================
# PROMPTS
# =============================================================================

function Get-TaskPrompt {
    param($task, $taskData)

    $maxFiles = if ($task.maxFiles) { $task.maxFiles } else { $taskData.config.maxFilesPerTask }

    $prompt = @"
You are improving Rise, an AI cofounder app (Next.js + Supabase).

CURRENT TASK:
$($task.description)

STRICT RULES:
- Maximum $maxFiles files changed
- NO package.json changes (no new dependencies)
- NO database schema changes (no .prisma files)
- NO .env or secret files
- NO node_modules changes

WORKFLOW:
1. First, understand what files you'll need to modify
2. List the specific files BEFORE editing (max $maxFiles)
3. Implement the change
4. Stage only the files you changed with: git add <specific-files>
5. Commit with a clear message describing what you did

If the task requires more than $maxFiles files, output "SKIP: [reason]" and stop.
If you encounter blockers, output "NOOP: [explanation]" and stop.

Focus on quality over speed. Make it work correctly.
"@

    return $prompt
}

function Get-GoalPrompt {
    param([string]$goal, $state, $taskData)

    $observations = $state.observations | Select-Object -Last 5
    $observationText = if ($observations) { $observations -join "`n" } else { "None yet" }
    $loopNum = $state.currentLoop

    $prompt = @"
You are the overnight AI improving Rise - an app that helps people find their path to freedom and build toward it with an AI cofounder.

PRODUCT VISION:
Rise should be INDISPENSABLE. Users should feel like they have a brilliant, supportive cofounder who:
- Helps them discover what they really want (PathFinder)
- Breaks big dreams into achievable milestones
- Provides expert guidance when they're stuck (Milestone Mode)
- Celebrates progress and keeps them motivated
- Makes the journey feel manageable and rewarding

BUSINESS GOAL: $goal

Create an app people will want to BUY, USE DAILY, and RECOMMEND to friends.

YOUR MISSION (Loop $loopNum):
1. First, EXPLORE the codebase - read key files to understand what exists
2. Think like a product person: "What would make users say WOW?"
3. Pick ONE high-impact improvement that moves toward the goal
4. Implement it with quality (this ships to real users)

WHAT MAKES USERS LOVE AN APP:
- Moments of delight (micro-interactions, smooth animations)
- Feeling understood (personalization, smart defaults)
- Trust signals (polish, no bugs, professional feel)
- Reduced friction (fast, intuitive, forgiving)
- Progress visibility (streaks, stats, celebrations)
- Emotional resonance (copy that connects, not corporate)

RECENT OBSERVATIONS FROM PREVIOUS LOOPS:
$observationText

STRICT RULES:
- Maximum 3 files changed per iteration
- NO package.json changes (no new dependencies)
- NO database schema changes
- NO .env or secret files

WORKFLOW:
1. Explore: Read 2-3 key files to find opportunities
2. Decide: Pick the highest-impact improvement you can make in 3 files
3. Implement: Make it excellent, not just functional
4. Test mentally: Would this impress a user? A reviewer?
5. Stage: git add <specific-files>
6. Commit: git commit -m "Improve: [what and why it matters to users]"

IMPORTANT - Record observations for future loops:
If you notice other opportunities, START your response with:
OBSERVATION: [what you noticed for future improvement]

OUTPUT SIGNALS:
- If blocked: "BLOCKED: [reason]"
- If goal fully achieved: "GOAL_COMPLETE"
- Otherwise: Just do the work and commit

Think like a founder. Ship something you'd be proud of.
"@

    return $prompt
}

# =============================================================================
# REPORT GENERATION
# =============================================================================

function New-MorningReport {
    param($state, $taskData)

    $endTime = Get-Date
    $startTime = [DateTime]::Parse($state.startedAt)
    $duration = $endTime - $startTime

    $completedList = ""
    foreach ($taskId in $state.completedTasks) {
        $task = $taskData.tasks | Where-Object { $_.id -eq $taskId }
        if ($task) {
            $completedList += "- [x] $($task.description)`n"
        }
    }
    if (-not $completedList) { $completedList = "None`n" }

    $failedList = ""
    foreach ($taskId in $state.failedTasks) {
        $task = $taskData.tasks | Where-Object { $_.id -eq $taskId }
        if ($task) {
            $failedList += "- [ ] $($task.description)`n"
        }
    }
    if (-not $failedList) { $failedList = "None`n" }

    $observationList = ""
    foreach ($obs in $state.observations) {
        $observationList += "- $obs`n"
    }
    if (-not $observationList) { $observationList = "None recorded`n" }

    $reviewList = ""
    foreach ($item in $state.reviewRequired) {
        $reviewList += "- $item`n"
    }
    if (-not $reviewList) { $reviewList = "None`n" }

    $report = @"
# Overnight Report - $(Get-Date -Format "yyyy-MM-dd")

## Summary
- **Started:** $($startTime.ToString("h:mm tt"))
- **Ended:** $($endTime.ToString("h:mm tt"))
- **Duration:** $([math]::Round($duration.TotalHours, 1)) hours
- **Loops:** $($state.currentLoop)
- **Commits:** $($state.totalCommits)
- **Completed Tasks:** $($state.completedTasks.Count)
- **Failed Tasks:** $($state.failedTasks.Count)
- **Skipped Tasks:** $($state.skippedTasks.Count)

## Completed Tasks
$completedList

## Failed Tasks
$failedList

## Review Required
$reviewList

## AI Observations
$observationList

## Stop Reason
$(if ($state.consecutiveFailures -ge $MAX_CONSECUTIVE_FAILURES) { "Consecutive failures threshold reached ($MAX_CONSECUTIVE_FAILURES)" }
elseif ($state.consecutiveNoOps -ge $MAX_CONSECUTIVE_NOOPS) { "Consecutive no-ops threshold reached ($MAX_CONSECUTIVE_NOOPS)" }
elseif ($state.currentLoop -ge $MaxLoops) { "Maximum loops reached ($MaxLoops)" }
else { "Manual stop or completion" })

## Next Steps
1. Review the changes: ``git log --oneline $MAIN_BRANCH..HEAD``
2. Check diff: ``git diff $MAIN_BRANCH..HEAD``
3. Cherry-pick good commits or merge the branch

---
*Generated by Overnight AI Experiment v2.0*
"@

    # Ensure reports directory exists
    if (-not (Test-Path $REPORT_DIR)) {
        New-Item -ItemType Directory -Path $REPORT_DIR -Force | Out-Null
    }

    $report | Set-Content $REPORT_FILE
    Write-Log "Morning report saved to: $REPORT_FILE" "Green"

    return $report
}

# =============================================================================
# MAIN LOOP
# =============================================================================

function Start-OvernightExperiment {
    Write-Banner "OVERNIGHT AI EXPERIMENT v2.0"

    # Setup
    Enable-SleepPrevention
    Set-Location $PROJECT_ROOT

    # Ensure directories exist
    if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
    if (-not (Test-Path $REPORT_DIR)) { New-Item -ItemType Directory -Path $REPORT_DIR -Force | Out-Null }
    if (-not (Test-Path $PROMPT_DIR)) { New-Item -ItemType Directory -Path $PROMPT_DIR -Force | Out-Null }

    Write-Log "Starting experiment" "Cyan"
    Write-Log "Risk Level: $RiskLevel" "Cyan"
    Write-Log "Max Loops: $MaxLoops" "Cyan"
    Write-Log "Task File: $TaskFile" "Cyan"
    if ($Goal) { Write-Log "Goal: $Goal" "Cyan" }

    # Load state and tasks
    $state = Initialize-State
    $taskData = Load-Tasks

    # Create experimental branch
    Write-Log "Creating branch: $BRANCH" "Green"
    git checkout -b $BRANCH 2>&1 | Out-Null

    if ($DryRun) {
        Write-Log "DRY RUN MODE - No actual changes will be made" "Yellow"
    }

    Write-Log "Starting main loop. Press Ctrl+C to stop." "Yellow"
    Start-Sleep -Seconds 3

    # Main experiment loop
    for ($i = 1; $i -le $MaxLoops; $i++) {
        $state.currentLoop = $i
        Save-State $state

        Write-Banner "Loop $i of $MaxLoops"

        # Check stop conditions
        if ($state.consecutiveFailures -ge $MAX_CONSECUTIVE_FAILURES) {
            Write-Log "STOPPING: $MAX_CONSECUTIVE_FAILURES consecutive failures" "Red"
            break
        }
        if ($state.consecutiveNoOps -ge $MAX_CONSECUTIVE_NOOPS) {
            Write-Log "STOPPING: $MAX_CONSECUTIVE_NOOPS consecutive no-ops" "Yellow"
            break
        }

        # Get prompt based on mode
        if ($Goal) {
            $prompt = Get-GoalPrompt -goal $Goal -state $state -taskData $taskData
            $currentTaskId = "goal-$i"
        } else {
            $task = Get-NextTask -taskData $taskData -riskLevel $RiskLevel

            if (-not $task) {
                Write-Log "No more tasks available at risk level: $RiskLevel" "Yellow"
                break
            }

            Write-Log "Task: $($task.description)" "Cyan"
            $prompt = Get-TaskPrompt -task $task -taskData $taskData
            $currentTaskId = $task.id
            Update-TaskStatus -taskData $taskData -taskId $task.id -status "in_progress"
        }

        # Run Claude
        $retry = 0
        $success = $false
        $claudeOutput = ""

        while (-not $success -and $retry -lt $MAX_RETRIES) {
            try {
                if ($DryRun) {
                    Write-Log "DRY RUN: Would execute Claude with prompt" "Yellow"
                    $claudeOutput = "DRY RUN - No actual execution"
                    $success = $true
                } else {
                    $claudeOutput = claude --dangerously-skip-permissions --print $prompt 2>&1
                    $success = $true
                }
            } catch {
                $retry++
                Write-Log "Error occurred, retry $retry of $MAX_RETRIES..." "Yellow"
                Start-Sleep -Seconds 30
            }
        }

        if (-not $success) {
            Write-Log "Failed after $MAX_RETRIES retries" "Red"
            $state.consecutiveFailures++
            if (-not $Goal) {
                Update-TaskStatus -taskData $taskData -taskId $currentTaskId -status "failed"
                $state.failedTasks += $currentTaskId
            }
            Save-State $state
            continue
        }

        # Check for special outputs
        if ($claudeOutput -match "SKIP:\s*(.+)") {
            $reason = $Matches[1]
            Write-Log "Task skipped: $reason" "Yellow"
            if (-not $Goal) {
                Update-TaskStatus -taskData $taskData -taskId $currentTaskId -status "skipped"
                $state.skippedTasks += $currentTaskId
            }
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }

        if ($claudeOutput -match "NOOP:\s*(.+)") {
            $reason = $Matches[1]
            Write-Log "No-op: $reason" "Yellow"
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }

        if ($claudeOutput -match "BLOCKED:\s*(.+)") {
            $reason = $Matches[1]
            Write-Log "Blocked: $reason" "Yellow"
            Add-Observation -state $state -observation "Blocked - $reason"
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }

        if ($claudeOutput -match "GOAL_COMPLETE") {
            Write-Log "Goal completed!" "Green"
            break
        }

        # Capture observations
        if ($claudeOutput -match "OBSERVATION:\s*(.+)") {
            Add-Observation -state $state -observation $Matches[1]
        }

        # Check if any changes were made
        $changedFiles = Get-ChangedFiles
        if ($changedFiles.Count -eq 0) {
            Write-Log "No changes detected" "Yellow"
            $state.consecutiveNoOps++
            Save-State $state
            Start-Sleep -Seconds $PAUSE_SECONDS
            continue
        }

        Write-Log "Changes detected in $($changedFiles.Count) files" "Cyan"

        # Run quality gates
        if (-not $DryRun) {
            $qualityPassed = Invoke-QualityGates

            if (-not $qualityPassed) {
                Write-Log "Quality gates failed - reverting changes" "Red"
                Invoke-Revert
                $state.consecutiveFailures++
                if (-not $Goal) {
                    Update-TaskStatus -taskData $taskData -taskId $currentTaskId -status "failed"
                    $state.failedTasks += $currentTaskId
                }
                Save-State $state
                Start-Sleep -Seconds $PAUSE_SECONDS
                continue
            }
        }

        # Smart staging
        $stagingResult = Invoke-SmartStaging -taskData $taskData

        if ($stagingResult.staged.Count -eq 0) {
            Write-Log "No files staged (all blocked or none changed)" "Yellow"
            Invoke-Revert
            $state.consecutiveNoOps++
            Save-State $state
            continue
        }

        if ($stagingResult.exceededLimit) {
            Write-Log "WARNING: File limit exceeded, some changes not staged" "Yellow"
            $state.reviewRequired += "Loop $i exceeded file limit"
        }

        if ($stagingResult.blocked.Count -gt 0) {
            Write-Log "Blocked files: $($stagingResult.blocked -join ', ')" "Yellow"
        }

        # Commit
        $commitMsg = if ($Goal) {
            "overnight: Goal progress (loop $i)"
        } else {
            $taskDesc = ($taskData.tasks | Where-Object { $_.id -eq $currentTaskId }).description
            "overnight: $taskDesc"
        }

        if (-not $DryRun) {
            $committed = Invoke-Commit -message $commitMsg

            if ($committed) {
                $state.totalCommits++
                $state.consecutiveFailures = 0
                $state.consecutiveNoOps = 0

                if (-not $Goal) {
                    Update-TaskStatus -taskData $taskData -taskId $currentTaskId -status "completed"
                    $state.completedTasks += $currentTaskId
                }

                Write-Log "Loop $i completed successfully" "Green"
            }
        } else {
            Write-Log "DRY RUN: Would commit - $commitMsg" "Yellow"
        }

        Save-State $state

        # Progress update
        $commitCount = Get-CommitCount
        Write-Log "Total commits: $commitCount | Completed: $($state.completedTasks.Count) | Failed: $($state.failedTasks.Count)" "Magenta"

        # Pause before next loop
        Write-Log "Pausing $PAUSE_SECONDS seconds..." "Gray"
        Start-Sleep -Seconds $PAUSE_SECONDS
    }

    # Generate morning report
    Write-Banner "EXPERIMENT COMPLETE"
    $report = New-MorningReport -state $state -taskData $taskData

    Write-Host $report

    Write-Log "Branch: $BRANCH" "Cyan"
    Write-Log "Report: $REPORT_FILE" "Cyan"
    Write-Log "Log: $LOG_FILE" "Cyan"
}

# =============================================================================
# ENTRY POINT
# =============================================================================

try {
    Start-OvernightExperiment
} catch {
    Write-Log "Fatal error: $_" "Red"
    # Still try to generate report on error
    try {
        $state = Load-State
        $taskData = Load-Tasks
        New-MorningReport -state $state -taskData $taskData
    } catch {
        Write-Log "Could not generate report: $_" "Red"
    }
}
