param(
    [Parameter(Mandatory = $true)]
    [string]$ProfileId,

    [string]$RootPath = ""
)

if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    $RootPath = Split-Path -Parent $ScriptDir
}

$ProfilesPath = Join-Path $RootPath "config\install_profiles.json"
$ModulesPath = Join-Path $RootPath "config\modules.json"

if (-not (Test-Path $ProfilesPath)) {
    throw "Missing install profiles file: $ProfilesPath"
}
if (-not (Test-Path $ModulesPath)) {
    throw "Missing modules manifest: $ModulesPath"
}

$Profiles = Get-Content $ProfilesPath -Raw | ConvertFrom-Json
$Modules = Get-Content $ModulesPath -Raw | ConvertFrom-Json

if (-not $Profiles.profiles.$ProfileId) {
    $Known = @($Profiles.profiles.PSObject.Properties.Name)
    throw "Unknown profile '$ProfileId'. Known profiles: $($Known -join ', ')"
}

$EnabledIds = @{}
foreach ($ModuleId in @($Profiles.profiles.$ProfileId.enabled_modules)) {
    if (-not [string]::IsNullOrWhiteSpace($ModuleId)) {
        $EnabledIds[$ModuleId] = $true
    }
}

foreach ($Module in $Modules.modules) {
    $Module.enabled = $EnabledIds.ContainsKey([string]$Module.id)
}

$Modules.active_profile = $ProfileId
$Json = $Modules | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($ModulesPath, $Json, [System.Text.UTF8Encoding]::new($false))

Write-Host "Applied install profile '$ProfileId' to $ModulesPath" -ForegroundColor Green
Write-Host ("Enabled modules: " + (($Modules.modules | Where-Object { $_.enabled }).id -join ', ')) -ForegroundColor Cyan