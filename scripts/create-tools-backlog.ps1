#Requires -Version 5.1
<#
.SYNOPSIS
  Creates the tool library backlog (epics E11 to E19, SDS section 19) as linked GitHub issues.

.DESCRIPTION
  Merges two files and hands the result to scripts/create-backlog.ps1:
  - specs/backlog/backlog.json            epic E11 (first tranche of new tools)
  - specs/backlog/backlog-tools.json      epics E12 to E19 plus their labels and milestone M6

  Everything create-backlog.ps1 does applies: epics, features and stories are created parents
  first, linked as GitHub sub-issues and in the Parent/Children blocks of the issue bodies; every
  issue carries its details (user story, acceptance criteria, tasks, SDS references), the
  assignee, labels and milestone. Labels and milestones are created when missing. The script is
  idempotent and shares specs/backlog/.backlog-state.json with create-backlog.ps1, so issues that
  exist are never created twice, and an interrupted run continues where it stopped.

  Epics E01 to E10 are not read, so nothing of the earlier backlog is touched.

.PARAMETER Only
  Limit the run to one epic id, for example E13.

.PARAMETER DryRun
  Create nothing; print the counts and write all titles and bodies to
  specs/backlog/.backlog-preview.md for review.

.PARAMETER UpdateExisting
  Also rewrite title, body, labels, milestone and assignee of issues that already exist.

.EXAMPLE
  ./scripts/create-tools-backlog.ps1 -DryRun

.EXAMPLE
  ./scripts/create-tools-backlog.ps1

.EXAMPLE
  ./scripts/create-tools-backlog.ps1 -Only E12
#>
[CmdletBinding()]
param(
  [string]$Owner = 'gwinnem',
  [string]$Repo = 'keystone-financial-tools',
  [string]$Assignee,
  [string]$Token,
  [string]$Only,
  [int]$DelayMs = 1000,
  [switch]$DryRun,
  [switch]$UpdateExisting,
  [string]$ApiBase = 'https://api.github.com',
  [string]$BacklogPath = ([System.IO.Path]::Combine($PSScriptRoot, '..', 'specs', 'backlog', 'backlog.json')),
  [string]$ToolsPath = ([System.IO.Path]::Combine($PSScriptRoot, '..', 'specs', 'backlog', 'backlog-tools.json')),
  [string]$StatePath = ([System.IO.Path]::Combine($PSScriptRoot, '..', 'specs', 'backlog', '.backlog-state.json')),
  [string]$PreviewPath = ([System.IO.Path]::Combine($PSScriptRoot, '..', 'specs', 'backlog', '.backlog-preview.md'))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$engine = [System.IO.Path]::Combine($PSScriptRoot, 'create-backlog.ps1')
foreach ($path in @($engine, $BacklogPath, $ToolsPath)) {
  if (-not (Test-Path -LiteralPath $path)) { throw "File not found: $path" }
}

function Read-Json {
  param([string]$Path)
  $raw = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path, [System.Text.Encoding]::UTF8)
  return ($raw | ConvertFrom-Json)
}

$base = Read-Json $BacklogPath
$tools = Read-Json $ToolsPath

$labels = New-Object System.Collections.Generic.List[object]
$labelNames = @{}
foreach ($label in @($base.labels) + @($tools.labels)) {
  if (-not $labelNames.ContainsKey($label.name)) { $labelNames[$label.name] = $true; $labels.Add($label) }
}
$milestones = New-Object System.Collections.Generic.List[object]
$milestoneTitles = @{}
foreach ($milestone in @($base.milestones) + @($tools.milestones)) {
  if (-not $milestoneTitles.ContainsKey($milestone.title)) { $milestoneTitles[$milestone.title] = $true; $milestones.Add($milestone) }
}

$epics = New-Object System.Collections.Generic.List[object]
foreach ($epic in @($base.epics)) {
  if ($epic.id -eq 'E11') { $epics.Add($epic) }
}
foreach ($epic in @($tools.epics)) {
  if ($epics | Where-Object { $_.id -eq $epic.id }) { throw "Epic $($epic.id) is defined in both backlog files." }
  $epics.Add($epic)
}
if ($epics.Count -eq 0) { throw 'No tool library epics found.' }

$merged = [ordered]@{
  version    = $base.version
  repository = $base.repository
  assignee   = $base.assignee
  sds        = $base.sds
  labels     = $labels.ToArray()
  milestones = $milestones.ToArray()
  standards  = $base.standards
  epics      = $epics.ToArray()
}

$temp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "keystone-tools-backlog-$([guid]::NewGuid().ToString('N')).json")
try {
  $json = ConvertTo-Json -InputObject ([pscustomobject]$merged) -Depth 60
  [System.IO.File]::WriteAllText($temp, $json, (New-Object System.Text.UTF8Encoding($false)))

  $arguments = @{
    Owner       = $Owner
    Repo        = $Repo
    DelayMs     = $DelayMs
    ApiBase     = $ApiBase
    BacklogPath = $temp
    StatePath   = $StatePath
    PreviewPath = $PreviewPath
  }
  if ($Assignee) { $arguments['Assignee'] = $Assignee }
  if ($Token) { $arguments['Token'] = $Token }
  if ($Only) { $arguments['Only'] = $Only }
  if ($DryRun) { $arguments['DryRun'] = $true }
  if ($UpdateExisting) { $arguments['UpdateExisting'] = $true }

  & $engine @arguments
}
finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
}
