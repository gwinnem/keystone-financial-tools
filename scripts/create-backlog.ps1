#Requires -Version 5.1
<#
.SYNOPSIS
  Creates the keystone-financial-tools backlog (epics, features, stories) as linked GitHub issues.

.DESCRIPTION
  Reads specs/backlog/backlog.json and creates one GitHub issue per backlog item, parents first
  (epic > feature > story). Every issue gets the backlog assignee, its labels and its milestone.

  Parent and child issues are linked both ways:
  - As GitHub sub-issues (the parent shows its children with progress; the child shows its parent).
  - In the issue bodies: every child body has a "Parent" line linking the parent issue, and every
    parent body has a "Children" list linking each child issue. These blocks sit between hidden
    markers and are kept up to date on every run; text outside the blocks is never touched unless
    -UpdateExisting is given.

  Stories marked "status": "done" in backlog.json (delivered before the backlog existed) are
  created and then closed as completed.

  Runs on Windows PowerShell 5.1 and PowerShell 7.

  The script is idempotent and safe to re-run:
  - Created issues are recorded in a local state file (specs/backlog/.backlog-state.json).
  - Each issue body carries a hidden marker (<!-- backlog-id: ... -->). Before creating anything,
    the script scans the repository's issues for markers, so nothing is created twice even if the
    state file is lost or the script runs on another machine.
  - Labels and milestones are created only when missing.
  - Missing sub-issue links are added on every run; Parent/Children blocks are rewritten whenever
    a linked issue number or title changes.
  - A second run with nothing to do makes no write calls.

  GitHub limits how fast content can be created. The script waits -DelayMs between write calls and
  waits and retries automatically on rate-limit responses. If a run is interrupted, run it again:
  it continues where it stopped.

.PARAMETER Owner
  Repository owner. Default: gwinnem.

.PARAMETER Repo
  Repository name. Default: keystone-financial-tools.

.PARAMETER Assignee
  GitHub login to assign. Default: the "assignee" field in backlog.json.

.PARAMETER Token
  Optional. By default the script uses the login the terminal already has: $env:GITHUB_TOKEN, then
  the GitHub CLI login (`gh auth token`), then the Git credential manager login for github.com
  (the one `git push` uses).

.PARAMETER Only
  Limit the run to one epic id, for example E04.

.PARAMETER DelayMs
  Pause after each write call in milliseconds. Default: 1000.

.PARAMETER DryRun
  Build every issue without calling GitHub, print the counts and write all titles and bodies to
  specs/backlog/.backlog-preview.md for review.

.PARAMETER UpdateExisting
  Also rewrite title, body, labels, milestone and assignee of issues that already exist (use after
  changing backlog.json). Open/closed state is never changed for existing issues.

.EXAMPLE
  ./scripts/create-backlog.ps1 -DryRun

.EXAMPLE
  ./scripts/create-backlog.ps1

.EXAMPLE
  ./scripts/create-backlog.ps1 -Only E04 -UpdateExisting
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
  [string]$StatePath = ([System.IO.Path]::Combine($PSScriptRoot, '..', 'specs', 'backlog', '.backlog-state.json')),
  [string]$PreviewPath = ([System.IO.Path]::Combine($PSScriptRoot, '..', 'specs', 'backlog', '.backlog-preview.md'))
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------------------------
# JSON and file helpers (ConvertFrom-Json -AsHashtable does not exist in Windows PowerShell 5.1)
# ---------------------------------------------------------------------------------------------

function ConvertTo-HashtableDeep {
  param($InputObject)
  if ($null -eq $InputObject) { return $null }
  if ($InputObject -is [string] -or $InputObject -is [System.ValueType]) { return $InputObject }
  if ($InputObject -is [System.Collections.IDictionary]) { return $InputObject }
  if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
    $table = @{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $table[$property.Name] = ConvertTo-HashtableDeep $property.Value
    }
    return $table
  }
  if ($InputObject -is [System.Collections.IEnumerable]) {
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($element in $InputObject) { $list.Add((ConvertTo-HashtableDeep $element)) }
    return , $list.ToArray()
  }
  return $InputObject
}

function Read-JsonFile {
  param([string]$Path)
  $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  return ConvertTo-HashtableDeep ($raw | ConvertFrom-Json)
}

function Write-TextFile {
  param([string]$Path, [string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-List {
  # Emits the value's items (nothing when missing). Always call it as @(Get-List ...).
  param($Value)
  if ($null -eq $Value) { return }
  $Value
}

function Get-Hash {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').Substring(0, 16)
  }
  finally { $sha.Dispose() }
}

# ---------------------------------------------------------------------------------------------
# Backlog loading
# ---------------------------------------------------------------------------------------------

if (-not (Test-Path -LiteralPath $BacklogPath)) { throw "Backlog file not found: $BacklogPath" }
$BacklogPath = (Resolve-Path -LiteralPath $BacklogPath).Path
$backlog = Read-JsonFile $BacklogPath
if (-not $Assignee) { $Assignee = [string]$backlog['assignee'] }

$repoUrl = "https://github.com/$Owner/$Repo"
$sdsUrl = "$repoUrl/blob/main/$($backlog['sds'])"
$standards = $backlog['standards']

function Format-Checklist {
  param([object[]]$Lines)
  return (@($Lines) | ForEach-Object { "- [ ] $_" }) -join "`n"
}

function Format-SdsRefs {
  param([object[]]$Refs)
  $list = @(Get-List $Refs)
  if ($list.Count -eq 0) { return "[SDS]($sdsUrl)" }
  return "$($list -join ', ') ([SDS]($sdsUrl))"
}

function Join-Labels {
  param([object[]]$Sets)
  $result = New-Object System.Collections.Generic.List[string]
  foreach ($set in $Sets) {
    foreach ($label in @(Get-List $set)) {
      if (-not $result.Contains([string]$label)) { $result.Add([string]$label) }
    }
  }
  return , $result.ToArray()
}

# Items: key, type, parent, children, title, label (short name for link lists), labels, milestone,
# status, and a sections list (the body without the link blocks).
$items = New-Object System.Collections.Generic.List[hashtable]
$byKey = @{}

function Add-Item {
  param([hashtable]$Item)
  $Item['children'] = New-Object System.Collections.Generic.List[string]
  $items.Add($Item)
  $byKey[$Item['key']] = $Item
  if ($Item['parent']) { $byKey[$Item['parent']]['children'].Add($Item['key']) }
}

foreach ($epic in @(Get-List $backlog['epics'])) {
  if ($Only -and $epic['id'] -ne $Only) { continue }
  $epicLabels = @(Get-List $epic['labels'])
  $features = @(Get-List $epic['features'])

  $s = New-Object System.Collections.Generic.List[string]
  $s.Add("## $($epic['id']) $($epic['title'])")
  $s.Add('')
  $s.Add([string]$epic['description'])
  $s.Add('')
  $s.Add("**Milestone:** $($epic['milestone']) | **SDS:** $(Format-SdsRefs $epic['sds'])")
  $s.Add('')
  $s.Add('### Acceptance criteria')
  $s.Add((Format-Checklist @(Get-List $standards['epicAcceptance'])))
  Add-Item @{
    key = $epic['id']; type = 'epic'; parent = $null
    title = "[Epic] $($epic['id']) $($epic['title'])"; label = "$($epic['id']) $($epic['title'])"
    labels = (Join-Labels @(@('epic'), $epicLabels)); milestone = [string]$epic['milestone']
    status = $null; sections = $s
  }

  foreach ($feature in $features) {
    $featureLabels = Join-Labels @($epicLabels, @(Get-List $feature['labels']))
    $milestone = if ($feature['milestone']) { [string]$feature['milestone'] } else { [string]$epic['milestone'] }

    $s = New-Object System.Collections.Generic.List[string]
    $s.Add("## $($feature['id']) $($feature['title'])")
    $s.Add('')
    $s.Add([string]$feature['description'])
    $s.Add('')
    $s.Add("**Value:** $($feature['why']).")
    $s.Add('')
    $s.Add("**Milestone:** $milestone | **SDS:** $(Format-SdsRefs $feature['sds'])")
    $s.Add('')
    $s.Add('### Acceptance criteria')
    $s.Add((Format-Checklist @(Get-List $standards['featureAcceptance'])))
    Add-Item @{
      key = $feature['id']; type = 'feature'; parent = $epic['id']
      title = "[Feature] $($feature['id']) $($feature['title'])"; label = "$($feature['id']) $($feature['title'])"
      labels = (Join-Labels @(@('feature'), $featureLabels)); milestone = $milestone
      status = $null; sections = $s
    }

    foreach ($story in @(Get-List $feature['stories'])) {
      $done = ([string]$story['status']) -eq 'done'
      $s = New-Object System.Collections.Generic.List[string]
      $s.Add("## $($story['id']) $($story['title'])")
      $s.Add('')
      $s.Add([string]$story['userStory'])
      $s.Add('')
      if ($done) {
        $s.Add('> Delivered in 0.1, before this backlog was created. Kept for traceability.')
        $s.Add('')
      }
      $s.Add("**Milestone:** $milestone | **SDS:** $(Format-SdsRefs $story['sds'])")
      $s.Add('')
      $s.Add('### Acceptance criteria')
      $criteria = @(Get-List $story['acceptance']) + @(Get-List $standards['storyAcceptance'])
      $s.Add((Format-Checklist $criteria))
      $s.Add('')
      $s.Add('### Tasks')
      $s.Add((Format-Checklist @(Get-List $story['tasks'])))
      Add-Item @{
        key = $story['id']; type = 'story'; parent = $feature['id']
        title = "[Story] $($story['id']) $($story['title'])"; label = "$($story['id']) $($story['title'])"
        labels = (Join-Labels @(@('story'), $featureLabels, @(Get-List $story['labels']))); milestone = $milestone
        status = $(if ($done) { 'done' } else { $null }); sections = $s
      }
    }
  }
}

# Sanity checks: unique keys, parents before children, labels and milestones defined, sizes.
$seen = @{}
foreach ($item in $items) {
  if ($seen.ContainsKey($item['key'])) { throw "Duplicate backlog id: $($item['key'])" }
  if ($item['parent'] -and -not $seen.ContainsKey($item['parent'])) { throw "Parent $($item['parent']) of $($item['key']) is missing or comes later." }
  if ($item['title'].Length -gt 256) { throw "Title too long for $($item['key'])" }
  $seen[$item['key']] = $true
}
$definedLabels = @(@(Get-List $backlog['labels']) | ForEach-Object { $_['name'] })
$usedLabels = @($items | ForEach-Object { $_['labels'] } | Sort-Object -Unique)
$undefined = @($usedLabels | Where-Object { $definedLabels -notcontains $_ })
if ($undefined.Count -gt 0) { throw "Labels used but not defined in backlog.json: $($undefined -join ', ')" }
$definedMilestones = @(@(Get-List $backlog['milestones']) | ForEach-Object { $_['title'] })
$undefinedMs = @($items | ForEach-Object { $_['milestone'] } | Sort-Object -Unique | Where-Object { $definedMilestones -notcontains $_ })
if ($undefinedMs.Count -gt 0) { throw "Milestones used but not defined in backlog.json: $($undefinedMs -join ', ')" }

# ---------------------------------------------------------------------------------------------
# Body building with link blocks
# ---------------------------------------------------------------------------------------------

$state = @{}

function Get-IssueRef {
  # "#12" when the issue exists, otherwise the backlog id (filled in on a later pass).
  param([string]$Key)
  if ($state.ContainsKey($Key)) { return "#$($state[$Key]['number'])" }
  return '(not created yet)'
}

function New-ParentBlock {
  param([hashtable]$Item)
  if (-not $Item['parent']) { return $null }
  $parent = $byKey[$Item['parent']]
  $typeName = (Get-Culture).TextInfo.ToTitleCase([string]$parent['type'])
  return "<!-- parent:start -->`n**Parent ${typeName}:** $(Get-IssueRef $parent['key']) $($parent['label'])`n<!-- parent:end -->"
}

function New-ChildrenBlock {
  param([hashtable]$Item)
  if ($Item['children'].Count -eq 0) { return $null }
  $heading = switch ($Item['type']) { 'epic' { 'Features' } 'feature' { 'Stories' } default { 'Children' } }
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('<!-- children:start -->')
  $lines.Add("### $heading")
  foreach ($childKey in $Item['children']) {
    $lines.Add("- $(Get-IssueRef $childKey) $($byKey[$childKey]['label'])")
  }
  $lines.Add('<!-- children:end -->')
  return $lines -join "`n"
}

function New-Body {
  param([hashtable]$Item)
  $parts = New-Object System.Collections.Generic.List[string]
  $parentBlock = New-ParentBlock $Item
  if ($parentBlock) { $parts.Add($parentBlock); $parts.Add('') }
  $parts.Add(($Item['sections'] -join "`n"))
  $childrenBlock = New-ChildrenBlock $Item
  if ($childrenBlock) { $parts.Add(''); $parts.Add($childrenBlock) }
  $parts.Add('')
  $parts.Add("<!-- backlog-id: $($Item['key']) -->")
  return $parts -join "`n"
}

function Set-Block {
  # Replaces the marked block in Body with Block, or inserts it (parent at the top, children
  # before the backlog marker) when the issue body lost it.
  param([string]$Body, [string]$Name, [string]$Block)
  if (-not $Block) { return $Body }
  $pattern = "(?s)<!-- ${Name}:start -->.*?<!-- ${Name}:end -->"
  if ([regex]::IsMatch($Body, $pattern)) {
    return [regex]::Replace($Body, $pattern, { param($m) $Block }, 'None')
  }
  if ($Name -eq 'parent') { return "$Block`n`n$Body" }
  $marker = '<!-- backlog-id:'
  $at = $Body.LastIndexOf($marker)
  if ($at -ge 0) { return $Body.Substring(0, $at) + "$Block`n`n" + $Body.Substring($at) }
  return "$Body`n`n$Block"
}

$counts = $items | Group-Object { $_['type'] } | ForEach-Object { "$($_.Name): $($_.Count)" }
$doneCount = @($items | Where-Object { $_['status'] -eq 'done' }).Count
Write-Host "Backlog: $($items.Count) issues ($($counts -join ', '); $doneCount delivered stories created closed)"

if ($DryRun) {
  $preview = foreach ($item in $items) {
    "# $($item['title'])"
    ''
    "Type: $($item['type']) | Parent: $(if ($item['parent']) { $item['parent'] } else { '-' }) | Labels: $($item['labels'] -join ', ') | Milestone: $($item['milestone']) | Assignee: $Assignee$(if ($item['status'] -eq 'done') { ' | Closed: completed' })"
    ''
    New-Body $item
    ''
    '---'
    ''
  }
  Write-TextFile $PreviewPath ($preview -join "`n")
  Write-Host "Dry run: nothing sent to GitHub. Preview written to $PreviewPath"
  return
}

# ---------------------------------------------------------------------------------------------
# GitHub API (HttpClient works the same on Windows PowerShell 5.1 and PowerShell 7)
# ---------------------------------------------------------------------------------------------

if (-not $Token) { $Token = $env:GITHUB_TOKEN }
if (-not $Token -and (Get-Command gh -ErrorAction SilentlyContinue)) {
  try { $Token = (& gh auth token 2>$null | Select-Object -First 1) } catch { $Token = $null }
}
if (-not $Token -and (Get-Command git -ErrorAction SilentlyContinue)) {
  try {
    $credential = "protocol=https`nhost=github.com`n`n" | & git credential fill 2>$null
    foreach ($line in @($credential)) {
      if ($line -like 'password=*') { $Token = $line.Substring('password='.Length).Trim() }
    }
  }
  catch { $Token = $null }
}
if (-not $Token) {
  throw 'No GitHub login found. Log in with "gh auth login" or push once with git so the credential manager stores a login, or pass -Token.'
}

Add-Type -AssemblyName System.Net.Http
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12

$http = New-Object System.Net.Http.HttpClient
$http.Timeout = [TimeSpan]::FromSeconds(100)
$http.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $Token)
[void]$http.DefaultRequestHeaders.TryAddWithoutValidation('Accept', 'application/vnd.github+json')
[void]$http.DefaultRequestHeaders.TryAddWithoutValidation('X-GitHub-Api-Version', '2022-11-28')
[void]$http.DefaultRequestHeaders.TryAddWithoutValidation('User-Agent', 'keystone-financial-tools-backlog')

$script:writeCalls = 0

function Get-HeaderValue {
  param($Response, [string]$Name)
  foreach ($header in $Response.Headers) {
    if ($header.Key -eq $Name) { return @($header.Value)[0] }
  }
  return $null
}

function Invoke-GitHub {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    $Body,
    [int[]]$AllowStatus = @()
  )
  $uri = "$ApiBase$Path"
  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 10 -Compress } else { $null }
  if ($Method -ne 'GET') { $script:writeCalls++ }

  for ($attempt = 1; $attempt -le 10; $attempt++) {
    $request = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($Method)), $uri)
    if ($null -ne $json) {
      $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, 'application/json')
    }

    try {
      $response = $http.SendAsync($request).GetAwaiter().GetResult()
    }
    catch {
      $request.Dispose()
      $wait = [Math]::Min(300, 5 * $attempt)
      Write-Warning "Network error on $Method ${Path}: $($_.Exception.Message). Retrying in $wait s."
      Start-Sleep -Seconds $wait
      continue
    }

    $status = [int]$response.StatusCode
    $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $retryAfter = Get-HeaderValue $response 'Retry-After'
    $remaining = Get-HeaderValue $response 'X-RateLimit-Remaining'
    $reset = Get-HeaderValue $response 'X-RateLimit-Reset'
    $response.Dispose()
    $request.Dispose()

    $data = $null
    if ($content) { try { $data = $content | ConvertFrom-Json } catch { $data = $content } }

    if (($status -ge 200 -and $status -lt 300) -or ($AllowStatus -contains $status)) {
      return New-Object psobject -Property @{ Status = $status; Data = $data; Content = $content }
    }

    $isRateLimit = $status -eq 429 -or ($status -eq 403 -and ($retryAfter -or $remaining -eq '0' -or $content -match 'rate limit'))
    if ($isRateLimit) {
      if ($retryAfter) { $wait = [int]$retryAfter }
      elseif ($remaining -eq '0' -and $reset) { $wait = [int]([long]$reset - [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) + 5 }
      else { $wait = [Math]::Min(900, 60 * $attempt) }
      $wait = [Math]::Max(5, $wait)
      Write-Warning "GitHub rate limit on $Method $Path. Waiting $wait s (attempt $attempt)."
      Start-Sleep -Seconds $wait
      continue
    }

    if ($status -ge 500) {
      $wait = [Math]::Min(300, 10 * $attempt)
      Write-Warning "GitHub returned $status on $Method $Path. Retrying in $wait s."
      Start-Sleep -Seconds $wait
      continue
    }

    throw "GitHub API $Method $Path failed with HTTP ${status}: $content"
  }
  throw "GitHub API $Method $Path failed after repeated retries."
}

function Wait-Write { if ($DelayMs -gt 0) { Start-Sleep -Milliseconds $DelayMs } }

# ---------------------------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------------------------

if (Test-Path -LiteralPath $StatePath) {
  $loaded = Read-JsonFile $StatePath
  if ($loaded) { foreach ($k in @($loaded.Keys)) { $state[$k] = $loaded[$k] } }
}

function Save-State {
  Write-TextFile $StatePath ($state | ConvertTo-Json -Depth 8)
}

# ---------------------------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------------------------

try {
  Write-Host "Repository: $Owner/$Repo | Assignee: $Assignee"

  $repoInfo = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo"
  if (-not $repoInfo.Data.has_issues) { throw "Issues are disabled on $Owner/$Repo." }

  $assigneeCheck = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/assignees/$Assignee" -AllowStatus @(404)
  if ($assigneeCheck.Status -eq 404) { throw "$Assignee cannot be assigned issues in $Owner/$Repo." }

  # Labels (create missing only).
  Write-Host 'Checking labels...'
  $existingLabels = @{}
  for ($page = 1; ; $page++) {
    $result = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/labels?per_page=100&page=$page"
    $batch = @(Get-List $result.Data)
    foreach ($label in $batch) { $existingLabels[([string]$label.name).ToLowerInvariant()] = $true }
    if ($batch.Count -lt 100) { break }
  }
  foreach ($label in @(Get-List $backlog['labels'])) {
    if (-not $existingLabels.ContainsKey(([string]$label['name']).ToLowerInvariant())) {
      Invoke-GitHub -Method POST -Path "/repos/$Owner/$Repo/labels" -Body @{
        name = $label['name']; color = $label['color']; description = $label['description']
      } | Out-Null
      Write-Host "  created label $($label['name'])"
      Wait-Write
    }
  }

  # Milestones (create missing only).
  Write-Host 'Checking milestones...'
  $milestoneNumbers = @{}
  for ($page = 1; ; $page++) {
    $result = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/milestones?state=all&per_page=100&page=$page"
    $batch = @(Get-List $result.Data)
    foreach ($m in $batch) { $milestoneNumbers[[string]$m.title] = [int]$m.number }
    if ($batch.Count -lt 100) { break }
  }
  foreach ($m in @(Get-List $backlog['milestones'])) {
    if (-not $milestoneNumbers.ContainsKey([string]$m['title'])) {
      $result = Invoke-GitHub -Method POST -Path "/repos/$Owner/$Repo/milestones" -Body @{ title = $m['title']; description = $m['description'] }
      $milestoneNumbers[[string]$m['title']] = [int]$result.Data.number
      Write-Host "  created milestone $($m['title'])"
      Wait-Write
    }
  }

  # Existing issues with backlog markers (protects against duplicates when the state file is missing).
  Write-Host 'Scanning existing issues for backlog markers...'
  $markerPattern = [regex]'<!-- backlog-id: ([A-Za-z0-9\-]+) -->'
  for ($page = 1; ; $page++) {
    $result = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/issues?state=all&per_page=100&page=$page"
    $batch = @(Get-List $result.Data)
    foreach ($issue in $batch) {
      if ($issue.PSObject.Properties['pull_request']) { continue }
      $match = $markerPattern.Match([string]$issue.body)
      if ($match.Success) {
        $key = $match.Groups[1].Value
        if (-not $state.ContainsKey($key)) {
          # Recovered from its marker: the sub-issue link may already exist, so check before posting.
          $state[$key] = @{ number = [int]$issue.number; id = [long]$issue.id; linked = $false; linkHash = ''; recovered = $true; doneHandled = $true }
        }
      }
    }
    if ($batch.Count -lt 100) { break }
  }
  Save-State

  $created = 0; $updated = 0; $closed = 0; $linked = 0; $relinked = 0; $skipped = 0
  $total = $items.Count
  $index = 0

  # Pass 1: create (or update) issues, parents first, and link them as sub-issues.
  foreach ($item in $items) {
    $index++
    $key = $item['key']
    $payload = @{
      title     = [string]$item['title']
      body      = (New-Body $item)
      labels    = [string[]]@($item['labels'])
      assignees = [string[]]@($Assignee)
      milestone = $milestoneNumbers[[string]$item['milestone']]
    }

    if (-not $state.ContainsKey($key)) {
      $result = Invoke-GitHub -Method POST -Path "/repos/$Owner/$Repo/issues" -Body $payload
      $state[$key] = @{ number = [int]$result.Data.number; id = [long]$result.Data.id; linked = $false; linkHash = '' }
      Save-State
      $created++
      Write-Host ('[{0}/{1}] created #{2} {3}' -f $index, $total, $result.Data.number, $item['title'])
      Wait-Write
    }
    elseif ($UpdateExisting) {
      Invoke-GitHub -Method PATCH -Path "/repos/$Owner/$Repo/issues/$($state[$key]['number'])" -Body $payload | Out-Null
      $state[$key]['linkHash'] = ''
      Save-State
      $updated++
      Write-Host ('[{0}/{1}] updated #{2} {3}' -f $index, $total, $state[$key]['number'], $item['title'])
      Wait-Write
    }
    else {
      $skipped++
      Write-Verbose ('[{0}/{1}] exists #{2} {3}' -f $index, $total, $state[$key]['number'], $item['title'])
    }

    # Delivered stories are closed once, right after creation. The doneHandled flag makes this
    # resumable (a run stopped between create and close finishes the close) without ever closing
    # an issue that someone reopened later.
    if ($item['status'] -eq 'done' -and -not $state[$key]['doneHandled']) {
      $number = $state[$key]['number']
      $current = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/issues/$number"
      if ([string]$current.Data.state -eq 'open') {
        Invoke-GitHub -Method PATCH -Path "/repos/$Owner/$Repo/issues/$number" -Body @{ state = 'closed'; state_reason = 'completed' } | Out-Null
        $closed++
        Write-Host ('          closed #{0} (delivered)' -f $number)
        Wait-Write
      }
      $state[$key]['doneHandled'] = $true
      Save-State
    }

    # GitHub sub-issue link (parent -> child).
    $parentKey = $item['parent']
    if ($parentKey -and -not $state[$key]['linked']) {
      if (-not $state.ContainsKey($parentKey)) { throw "Parent $parentKey of $key has no issue." }
      $parentNumber = $state[$parentKey]['number']
      if ($state[$key]['recovered']) {
        $parentCheck = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/issues/$($state[$key]['number'])/parent" -AllowStatus @(404)
        $state[$key]['recovered'] = $false
        if ($parentCheck.Status -eq 200 -and [int]$parentCheck.Data.number -eq [int]$parentNumber) {
          $state[$key]['linked'] = $true
          Save-State
          continue
        }
      }
      $link = Invoke-GitHub -Method POST -Path "/repos/$Owner/$Repo/issues/$parentNumber/sub_issues" `
        -Body @{ sub_issue_id = [long]$state[$key]['id'] } -AllowStatus @(422)
      if ($link.Status -eq 422) {
        # Already a sub-issue (of this parent or another): check the current parent.
        $parentCheck = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/issues/$($state[$key]['number'])/parent" -AllowStatus @(404)
        if ($parentCheck.Status -eq 200 -and [int]$parentCheck.Data.number -eq [int]$parentNumber) {
          $state[$key]['linked'] = $true
        }
        else {
          Write-Warning "Could not link $key (#$($state[$key]['number'])) to $parentKey (#$parentNumber): $($link.Content)"
        }
      }
      else {
        $state[$key]['linked'] = $true
        $linked++
        Wait-Write
      }
      Save-State
    }
  }

  # Pass 2: keep the Parent and Children blocks in every body current (both link directions).
  # Only issues whose blocks changed since the last run are read and written.
  Write-Host 'Updating parent and children links in issue bodies...'
  foreach ($item in $items) {
    $key = $item['key']
    $parentBlock = New-ParentBlock $item
    $childrenBlock = New-ChildrenBlock $item
    $hash = Get-Hash "$parentBlock|$childrenBlock"
    if ($state[$key]['linkHash'] -eq $hash) { continue }

    $number = $state[$key]['number']
    $issue = Invoke-GitHub -Method GET -Path "/repos/$Owner/$Repo/issues/$number"
    $current = [string]$issue.Data.body
    $desired = Set-Block (Set-Block $current 'parent' $parentBlock) 'children' $childrenBlock
    if ($desired -ne $current) {
      Invoke-GitHub -Method PATCH -Path "/repos/$Owner/$Repo/issues/$number" -Body @{ body = $desired } | Out-Null
      $relinked++
      Write-Verbose ('links updated #{0} {1}' -f $number, $item['title'])
      Wait-Write
    }
    $state[$key]['linkHash'] = $hash
    Save-State
  }

  Write-Host ''
  Write-Host "Done. Created: $created | Closed as delivered: $closed | Updated: $updated | Already existed: $skipped | Sub-issue links added: $linked | Bodies relinked: $relinked | Write calls: $($script:writeCalls)"
  foreach ($item in $items) {
    if ($item['type'] -eq 'epic') {
      Write-Host ('  {0}: {1}/issues/{2}' -f $item['key'], $repoUrl, $state[$item['key']]['number'])
    }
  }
}
finally {
  $http.Dispose()
}
