param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$compactionItems = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)

Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -notmatch '^data:\s*(\{.*\})\s*$') {
        return
    }

    try {
        $eventData = $Matches[1] | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        return
    }

    $items = @()
    if ($null -ne $eventData.item) {
        $items += $eventData.item
    }
    if ($null -ne $eventData.response -and $null -ne $eventData.response.output) {
        $items += @($eventData.response.output)
    }

    foreach ($item in $items) {
        if ($null -eq $item -or [string]::IsNullOrWhiteSpace([string]$item.type)) {
            continue
        }
        if ($item.type -eq 'compaction') {
            $itemKey = [string]$item.id
            if ([string]::IsNullOrWhiteSpace($itemKey)) {
                $encryptedContent = [string]$item.encrypted_content
                if (-not [string]::IsNullOrWhiteSpace($encryptedContent)) {
                    $sha256 = [System.Security.Cryptography.SHA256]::Create()
                    try {
                        $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($encryptedContent))
                        $itemKey = 'sha256:' + (($hashBytes | ForEach-Object { $_.ToString('x2') }) -join '')
                    }
                    finally {
                        $sha256.Dispose()
                    }
                }
                else {
                    $itemKey = 'anonymous-compaction'
                }
            }
            $null = $compactionItems.Add($itemKey)
        }
        [pscustomobject]@{
            event_type             = [string]$eventData.type
            item_type              = [string]$item.type
            has_encrypted_content  = -not [string]::IsNullOrWhiteSpace([string]$item.encrypted_content)
        }
    }
}

[pscustomobject]@{
    summary          = 'compaction item count'
    compaction_items = $compactionItems.Count
}
