# Download the matching gmail-mcp release binary for this host.
#
# Env overrides:
#   $env:VERSION  release tag  (default: latest)
#   $env:PREFIX   install root (default: $env:USERPROFILE\.local — binary goes in $PREFIX\bin)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo    = 'AeyeOps/Gmail-MCP-Server'
$Version = if ($env:VERSION) { $env:VERSION } else { 'latest' }
$Prefix  = if ($env:PREFIX)  { $env:PREFIX  } else { Join-Path $env:USERPROFILE '.local' }
$BinDir  = Join-Path $Prefix 'bin'
$Dest    = Join-Path $BinDir 'gmail-mcp.exe'

switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { $asset = 'gmail-mcp-windows-x64.exe' }
    default {
        Write-Error "unsupported architecture: $env:PROCESSOR_ARCHITECTURE`nsee https://github.com/$Repo/releases for available assets"
        exit 1
    }
}

if ($Version -eq 'latest') {
    $url = "https://github.com/$Repo/releases/latest/download/$asset"
} else {
    $url = "https://github.com/$Repo/releases/download/$Version/$asset"
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$tmp = [System.IO.Path]::GetTempFileName()

try {
    Write-Host "downloading $asset ($Version) -> $Dest"
    $attempts = 0
    while ($true) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $tmp
            break
        } catch {
            $attempts++
            if ($attempts -ge 3) { throw }
            Start-Sleep -Seconds 2
        }
    }
    Move-Item -Force -Path $tmp -Destination $Dest
} catch {
    Remove-Item -Force -ErrorAction SilentlyContinue $tmp
    throw
}

Write-Host "installed: $Dest"
$pathEntries = $env:PATH -split ';'
if ($pathEntries -notcontains $BinDir) {
    Write-Host "note: $BinDir is not on `$env:PATH — add it to use the bare 'gmail-mcp' command"
}
