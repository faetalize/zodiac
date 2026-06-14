param(
	[Parameter(ValueFromRemainingArguments = $true)]
	[string[]] $CliArgs
)

$ErrorActionPreference = "Stop"

$HelpText = @"
Create a git worktree in a sibling folder and optionally publish it.

Usage:
  npm run create-worktree:win -- <branch> [worktree-path] [options]
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-worktree.ps1 <branch> [worktree-path] [options]

Positional arguments:
  branch         Local branch name to create or reuse.
  worktree-path  Optional destination path. Defaults to ../<branch> with / replaced by -.

Options:
  -h, --help                 Show this help text.
  --remote <name>           Remote to publish/track. Defaults to origin when available.
  --remote-branch <name>    Remote branch name. Defaults to the local branch name.
  --publish                 Push the branch and configure upstream tracking.
  --open                    Launch opencode in a new Windows Terminal window when available.
  --install                 Run npm install in the new worktree.
  --interactive             Ask for any values not passed on the CLI.

Examples:
  npm run create-worktree:win -- feature/chat-cleanup
  npm run create-worktree:win -- feature/chat-cleanup ../zodiac-chat-cleanup --open
  npm run create-worktree:win -- feature/123-chat-cleanup --install --publish --open
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-worktree.ps1 bugfix/456-sidebar ../zodiac-sidebar --remote origin --publish
"@

function Invoke-CheckedCommand {
	param(
		[Parameter(Mandatory = $true)]
		[string] $Command,

		[Parameter(Mandatory = $true)]
		[string[]] $Arguments,

		[string] $WorkingDirectory = (Get-Location).Path
	)

	Push-Location $WorkingDirectory
	try {
		& $Command @Arguments
		if ($LASTEXITCODE -ne 0) {
			throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
		}
	}
	finally {
		Pop-Location
	}
}

function Invoke-OutputCommand {
	param(
		[Parameter(Mandatory = $true)]
		[string] $Command,

		[Parameter(Mandatory = $true)]
		[string[]] $Arguments,

		[string] $WorkingDirectory = (Get-Location).Path
	)

	Push-Location $WorkingDirectory
	try {
		$output = & $Command @Arguments 2>&1
		if ($LASTEXITCODE -ne 0) {
			throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')`n$output"
		}

		return ($output -join "`n")
	}
	finally {
		Pop-Location
	}
}

function Get-NonEmptyLines {
	param([string] $Text)

	return $Text -split "`r?`n" |
		ForEach-Object { $_.Trim() } |
		Where-Object { $_.Length -gt 0 }
}

function Get-LocalBranches {
	return Get-NonEmptyLines (Invoke-OutputCommand "git" @("for-each-ref", "refs/heads", "--format=%(refname:short)"))
}

function Get-Remotes {
	return Get-NonEmptyLines (Invoke-OutputCommand "git" @("remote"))
}

function Get-RemoteBranches {
	param([string] $Remote)

	return Get-NonEmptyLines (Invoke-OutputCommand "git" @("for-each-ref", "refs/remotes/$Remote", "--format=%(refname:short)"))
}

function Get-Worktrees {
	$output = Invoke-OutputCommand "git" @("worktree", "list", "--porcelain")
	$entries = @()
	$current = @{}

	foreach ($rawLine in ($output -split "`r?`n")) {
		$line = $rawLine.Trim()
		if ($line.Length -eq 0) {
			continue
		}

		$parts = $line -split " ", 2
		$key = $parts[0]
		$value = if ($parts.Length -gt 1) { $parts[1] } else { "" }

		if ($key -eq "worktree") {
			if ($current.Count -gt 0) {
				$entries += [pscustomobject] $current
			}
			$current = @{ worktree = $value }
			continue
		}

		if ($key -eq "branch") {
			$current.branch = $value
			continue
		}

		if ($key -eq "detached") {
			$current.detached = $true
		}
	}

	if ($current.Count -gt 0) {
		$entries += [pscustomobject] $current
	}

	return $entries
}

function Read-NonEmpty {
	param([string] $Prompt)

	while ($true) {
		$answer = (Read-Host $Prompt).Trim()
		if ($answer.Length -gt 0) {
			return $answer
		}

		Write-Host "Value is required."
	}
}

function Read-YesNo {
	param(
		[string] $Prompt,
		[bool] $DefaultValue = $true
	)

	while ($true) {
		$answer = (Read-Host $Prompt).Trim().ToLowerInvariant()
		if ($answer.Length -eq 0) {
			return $DefaultValue
		}
		if ($answer -eq "y" -or $answer -eq "yes") {
			return $true
		}
		if ($answer -eq "n" -or $answer -eq "no") {
			return $false
		}

		Write-Host "Please answer yes or no."
	}
}

function Get-DefaultWorktreePath {
	param([string] $BranchName)

	return Join-Path ".." ($BranchName.Replace("/", "-"))
}

function Get-RemoteTrackingPrompt {
	param([string] $DefaultRemote)

	if ($DefaultRemote) {
		return "Configure remote tracking/publish? (y/N, default remote: ${DefaultRemote})"
	}

	return "Configure remote tracking/publish? (y/N)"
}

function Parse-Args {
	param([string[]] $Arguments)

	$options = [ordered] @{
		branchName = ""
		worktreePath = ""
		remote = ""
		remoteBranch = ""
		publish = $null
		open = $null
		install = $null
		interactive = $false
		showHelp = $false
	}

	$index = 0
	while ($index -lt $Arguments.Count) {
		$arg = $Arguments[$index]
		$index += 1

		if ($arg -eq "-h" -or $arg -eq "--help" -or $arg -eq "help") {
			$options.showHelp = $true
			continue
		}

		if ($arg -eq "--interactive") {
			$options.interactive = $true
			continue
		}

		if ($arg -eq "--publish") {
			$options.publish = $true
			continue
		}

		if ($arg -eq "--open") {
			$options.open = $true
			continue
		}

		if ($arg -eq "--install") {
			$options.install = $true
			continue
		}

		if ($arg -eq "--remote") {
			if ($index -ge $Arguments.Count) {
				throw "Missing value for --remote."
			}
			$options.remote = $Arguments[$index]
			$index += 1
			continue
		}

		if ($arg -eq "--remote-branch") {
			if ($index -ge $Arguments.Count) {
				throw "Missing value for --remote-branch."
			}
			$options.remoteBranch = $Arguments[$index]
			$index += 1
			continue
		}

		if ($arg.StartsWith("-")) {
			throw "Unknown option: $arg"
		}

		if (-not $options.branchName) {
			$options.branchName = $arg
			continue
		}

		if (-not $options.worktreePath) {
			$options.worktreePath = $arg
			continue
		}

		throw "Unexpected extra argument: $arg"
	}

	if (($options.remote -or $options.remoteBranch) -and -not $options.publish) {
		throw "--remote and --remote-branch can only be used with --publish."
	}

	return $options
}

function Test-ShouldPrompt {
	param([hashtable] $Options)

	return $Options.interactive -or (-not $Options.showHelp -and -not $Options.branchName)
}

function Get-EmptyHooksPath {
	$hooksPath = Join-Path ([System.IO.Path]::GetTempPath()) "zodiac-empty-git-hooks"
	New-Item -ItemType Directory -Force -Path $hooksPath | Out-Null
	return $hooksPath
}

function Invoke-GitWorktreeAdd {
	param([string[]] $Arguments)

	$emptyHooksPath = Get-EmptyHooksPath
	Invoke-CheckedCommand -Command "git" -Arguments (@("-c", "core.hooksPath=$emptyHooksPath", "worktree", "add") + $Arguments)
}

function Open-Opencode {
	param([string] $WorktreePath)

	$windowsTerminal = Get-Command "wt.exe" -ErrorAction SilentlyContinue
	if ($windowsTerminal) {
		Start-Process -FilePath $windowsTerminal.Source -ArgumentList @("-d", $WorktreePath, "opencode")
		return
	}

	$opencode = Get-Command "opencode" -ErrorAction SilentlyContinue
	if ($opencode) {
		Start-Process -FilePath $opencode.Source -WorkingDirectory $WorktreePath
		return
	}

	Write-Warning "Could not find wt.exe or opencode. Worktree was created, but no terminal was opened."
}

function Main {
	$cliOptions = Parse-Args $CliArgs

	if ($cliOptions.showHelp) {
		Write-Host $HelpText
		return
	}

	$shouldPrompt = Test-ShouldPrompt $cliOptions
	$localBranches = @(Get-LocalBranches)

	if ($shouldPrompt -and $localBranches.Count -gt 0) {
		Write-Host "Local branches:"
		foreach ($name in $localBranches) {
			Write-Host "- $name"
		}
		Write-Host ""
	}

	$branchName = $cliOptions.branchName
	if (-not $branchName) {
		$branchName = Read-NonEmpty "Local branch name (create or reuse)"
	}

	$branchExists = $localBranches -contains $branchName
	if ($branchExists) {
		$worktrees = @(Get-Worktrees)
		$branchRef = "refs/heads/$branchName"
		$existingWorktree = $worktrees | Where-Object { $_.branch -eq $branchRef } | Select-Object -First 1

		if ($existingWorktree) {
			[Console]::Error.WriteLine("Error: Branch '$branchName' is already checked out in worktree: $($existingWorktree.worktree)")
			[Console]::Error.WriteLine("Choose a different branch name or remove that worktree first.")
			exit 1
		}
	}

	$defaultWorktreePath = Get-DefaultWorktreePath $branchName
	$worktreePathInput = $cliOptions.worktreePath
	if (-not $worktreePathInput) {
		if ($shouldPrompt) {
			$worktreePathInput = (Read-Host "Worktree path (default: $defaultWorktreePath)").Trim()
			if (-not $worktreePathInput) {
				$worktreePathInput = $defaultWorktreePath
			}
		}
		else {
			$worktreePathInput = $defaultWorktreePath
		}
	}

	$remotes = @(Get-Remotes)
	if ($shouldPrompt -and $remotes.Count -gt 0) {
		Write-Host "Git remotes:"
		foreach ($name in $remotes) {
			Write-Host "- $name"
		}
		Write-Host ""
	}

	$defaultRemote = if ($remotes -contains "origin") { "origin" } else { "" }
	if ($null -ne $cliOptions.publish) {
		$publish = $cliOptions.publish
	}
	elseif ($shouldPrompt -and $remotes.Count -gt 0) {
		$publish = Read-YesNo (Get-RemoteTrackingPrompt $defaultRemote) $false
	}
	else {
		$publish = $false
	}

	$remote = ""
	if ($publish) {
		if ($cliOptions.remote) {
			$remote = $cliOptions.remote
		}
		elseif ($shouldPrompt) {
			if ($defaultRemote) {
				$remote = (Read-Host "Remote name to publish/track (default: $defaultRemote)").Trim()
				if (-not $remote) {
					$remote = $defaultRemote
				}
			}
			else {
				$remote = Read-NonEmpty "Remote name to publish/track"
			}
		}
		else {
			$remote = $defaultRemote
		}

		if (-not $remote) {
			[Console]::Error.WriteLine("Error: Publishing was requested but no git remote is available.")
			exit 1
		}
	}

	$remoteBranch = if ($cliOptions.remoteBranch) { $cliOptions.remoteBranch } else { $branchName }
	$remoteBranchExists = $false

	if ($remote) {
		if (-not ($remotes -contains $remote)) {
			[Console]::Error.WriteLine("Error: Remote '$remote' not found.")
			if ($remotes.Count -gt 0) {
				[Console]::Error.WriteLine("Known remotes: $($remotes -join ', ')")
			}
			exit 1
		}

		try {
			Write-Host "Fetching latest refs from '$remote'..."
			Invoke-CheckedCommand "git" @("fetch", "--prune", $remote)
		}
		catch {
			Write-Warning "Failed to fetch from '$remote'. Using existing refs."
		}

		$remoteBranches = @(Get-RemoteBranches $remote |
			ForEach-Object { $_.Replace("${remote}/", "") } |
			Where-Object { $_ -ne "HEAD" })

		if ($shouldPrompt -and $remoteBranches.Count -gt 0) {
			Write-Host "Remote branches on '$remote':"
			foreach ($name in $remoteBranches) {
				Write-Host "- $name"
			}
			Write-Host ""
		}

		if (-not $cliOptions.remoteBranch -and $shouldPrompt) {
			$remoteBranch = (Read-Host "Remote branch to track/publish (default: $branchName)").Trim()
			if (-not $remoteBranch) {
				$remoteBranch = $branchName
			}
		}

		$remoteBranchExists = $remoteBranches -contains $remoteBranch
	}

	Write-Host "Creating worktree for branch '$branchName' at '$worktreePathInput'..."
	if ([System.IO.Path]::IsPathRooted($worktreePathInput)) {
		$resolvedWorktreePath = [System.IO.Path]::GetFullPath($worktreePathInput)
	}
	else {
		$resolvedWorktreePath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $worktreePathInput))
	}

	if ($branchExists) {
		Invoke-GitWorktreeAdd -Arguments @($worktreePathInput, $branchName)
	}
	elseif ($remote -and $remoteBranchExists) {
		Invoke-GitWorktreeAdd -Arguments @("-b", $branchName, $worktreePathInput, "$remote/$remoteBranch")
	}
	else {
		Invoke-GitWorktreeAdd -Arguments @("-b", $branchName, $worktreePathInput)
	}

	if ($null -ne $cliOptions.install) {
		$shouldInstall = $cliOptions.install
	}
	elseif ($shouldPrompt) {
		$shouldInstall = Read-YesNo "Run npm install in the new worktree? (y/N)" $false
	}
	else {
		$shouldInstall = $false
	}

	if ($shouldInstall) {
		Write-Host "Running npm install on worktree..."
		try {
			Invoke-CheckedCommand "npm" @("install") $resolvedWorktreePath
		}
		catch {
			Write-Warning "npm install failed. Continuing with git setup..."
		}
	}
	else {
		Write-Host "Skipping npm install."
	}

	if ($remote) {
		Write-Host "Publishing '$branchName' to '$remote/$remoteBranch'..."
		Invoke-CheckedCommand "git" @("push", "-u", $remote, "${branchName}:${remoteBranch}") $resolvedWorktreePath
		Write-Host "Worktree created successfully and remote tracking configured."
	}
	else {
		Write-Host "Worktree created successfully (no remote tracking configured)."
	}

	if ($null -ne $cliOptions.open) {
		$shouldOpenOpencode = $cliOptions.open
	}
	elseif ($shouldPrompt) {
		$shouldOpenOpencode = Read-YesNo "Open opencode in a new Windows Terminal window? (y/N)" $false
	}
	else {
		$shouldOpenOpencode = $false
	}

	if ($shouldOpenOpencode) {
		Write-Host "Opening opencode in $resolvedWorktreePath..."
		Open-Opencode $resolvedWorktreePath
	}

	Write-Host "Worktree path: $resolvedWorktreePath"
}

try {
	Main
}
catch {
	$message = if ($_.Exception) { $_.Exception.Message } else { [string] $_ }
	[Console]::Error.WriteLine("Error: $message")
	[Console]::Error.WriteLine("Run with --help to see supported arguments.")
	exit 1
}
