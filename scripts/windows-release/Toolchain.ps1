# Optional per-user tool selection. Never changes a saved environment variable.
function Get-UpForgeToolchain {
    param([string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'UpForge\toolchain.json'))

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        return [pscustomobject]@{ mode = 'path'; directories = @(); configPath = $ConfigPath }
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $expected = @('schemaVersion', 'nodeDirectory', 'githubDirectory')
    $actual = @($config.PSObject.Properties.Name)
    if ($actual.Count -ne $expected.Count -or @(Compare-Object $expected $actual).Count -ne 0 -or
        ($config.schemaVersion -isnot [int] -and $config.schemaVersion -isnot [long]) -or $config.schemaVersion -ne 1) {
        throw 'Invalid UpForge toolchain.json. Expected schemaVersion 1, nodeDirectory and githubDirectory.'
    }
    foreach ($field in @('nodeDirectory', 'githubDirectory')) {
        $directory = $config.$field
        if ($directory -isnot [string] -or [string]::IsNullOrWhiteSpace($directory) -or
            $directory.Contains([string][IO.Path]::PathSeparator) -or -not [IO.Path]::IsPathRooted($directory) -or
            [IO.Path]::GetFullPath($directory) -ne $directory -or -not (Test-Path -LiteralPath $directory -PathType Container)) {
            throw "Invalid $field in UpForge toolchain.json. Use an existing absolute directory without PATH separators."
        }
    }
    $node = Join-Path $config.nodeDirectory 'node.exe'
    $github = Join-Path $config.githubDirectory 'gh.exe'
    if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $github -PathType Leaf)) {
        throw 'The configured UpForge toolchain is incomplete: node.exe and gh.exe must exist in their selected directories.'
    }
    return [pscustomobject]@{
        mode = 'configured'
        node = $node
        github = $github
        directories = @($config.nodeDirectory, $config.githubDirectory)
        configPath = $ConfigPath
    }
}
