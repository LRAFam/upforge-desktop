# Read-only pre-uninstall check. The OLD uninstaller deletes the entire install
# tree, so this must run in the NEW installer before that uninstaller is launched.
param([string]$InstallDirectory)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($InstallDirectory)) { exit 0 }

try {
    try {
        $root = Get-Item -LiteralPath $InstallDirectory -Force
    } catch [System.Management.Automation.ItemNotFoundException] {
        exit 0
    }
    if (-not $root.PSIsContainer) { throw 'The installation path is not a directory.' }

    $directories = New-Object 'System.Collections.Generic.Stack[string]'
    $directories.Push($root.FullName)
    $videoExtensions = @('.mp4', '.mkv', '.mov', '.flv', '.webm', '.avi', '.m4v')
    while ($directories.Count -gt 0) {
        $directory = Get-Item -LiteralPath $directories.Pop() -Force
        if ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            throw "Cannot safely check linked folder: $($directory.FullName)"
        }
        foreach ($entry in Get-ChildItem -LiteralPath $directory.FullName -Force) {
            if ($entry.PSIsContainer) {
                $directories.Push($entry.FullName)
            } elseif ($videoExtensions -contains $entry.Extension.ToLowerInvariant()) {
                Write-Output "Video found: $($entry.FullName)"
                Write-Output 'Move your videos to a folder outside the UpForge installation, then run setup again. No files have been changed by this check.'
                exit 2
            }
        }
    }
    exit 0
} catch {
    Write-Output "Could not check the installation folder safely: $($_.Exception.Message)"
    exit 3
}
