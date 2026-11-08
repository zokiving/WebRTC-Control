$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$separator = [IO.Path]::DirectorySeparatorChar
$prefix = $projectRoot.TrimEnd($separator) + $separator
function WorkspacePath([string]$relative) {
    $path = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Outside project: $path" }
    return $path
}
$manifest = Get-Content -LiteralPath (WorkspacePath 'manifest.json') -Raw | ConvertFrom-Json
$runtime = @('manifest.json','background.js','policy.js','i18n.js','messages.js','popup.html','popup.css','popup.js')
$runtime += @($manifest.icons.PSObject.Properties.Value)
$runtime += @($manifest.action.default_icon.PSObject.Properties.Value)
$runtime += @('_locales/en/messages.json','_locales/zh_CN/messages.json','_locales/zh_TW/messages.json')
$runtime = @($runtime | Select-Object -Unique)
if ($manifest.version -notmatch '^\d+(\.\d+){0,3}$') { throw 'Invalid manifest version' }
foreach ($file in $runtime) {
    if (-not (Test-Path -LiteralPath (WorkspacePath $file) -PathType Leaf)) { throw "Missing runtime file: $file" }
}
$dist = WorkspacePath 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$zipPath = WorkspacePath "dist/WebRTC-Control-$($manifest.version).zip"
$temporaryZip = WorkspacePath ("dist/.package-" + [Guid]::NewGuid().ToString('N') + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $archive = [IO.Compression.ZipFile]::Open($temporaryZip,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $runtime) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(WorkspacePath $file),$file,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose() }
    $archive = [IO.Compression.ZipFile]::OpenRead($temporaryZip)
    try {
        if ($archive.Entries.Count -ne $runtime.Count) { throw 'Unexpected package file count' }
        foreach ($file in $runtime) {
            $entry = $archive.GetEntry($file)
            if ($null -eq $entry) { throw "Missing entry: $file" }
            $entryStream = $entry.Open()
            $hasher = [Security.Cryptography.SHA256]::Create()
            try { $packedHash = [Convert]::ToHexString($hasher.ComputeHash($entryStream)) }
            finally { $entryStream.Dispose(); $hasher.Dispose() }
            if ($packedHash -ne (Get-FileHash -LiteralPath (WorkspacePath $file)).Hash) { throw "Package mismatch: $file" }
        }
    } finally { $archive.Dispose() }
    Move-Item -LiteralPath $temporaryZip -Destination $zipPath -Force
    Write-Output "Verified release: $zipPath ($($runtime.Count) runtime files)"
} finally {
    if (Test-Path -LiteralPath $temporaryZip -PathType Leaf) { Remove-Item -LiteralPath $temporaryZip -Force }
}
