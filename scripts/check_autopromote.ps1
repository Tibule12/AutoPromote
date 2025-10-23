$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outFile = Join-Path $outDir 'check_autopromote_response.txt'

try {
  $headers = @{
    "authority" = "autopromote-1.onrender.com"
    "method" = "GET"
    "path" = "/"
    "scheme" = "https"
    "accept" = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
    "accept-encoding" = "gzip, deflate, br, zstd"
    "accept-language" = "en-US,en;q=0.9"
    "cache-control" = "max-age=0"
    # Use RFC1123 format for the If-Modified-Since header
    "if-modified-since" = "Thu, 23 Oct 2025 16:00:43 GMT"
    "if-none-match" = '"58d526c816ef05747473dbc3ea33e997"'
    "priority" = "u=0, i"
    "sec-ch-ua" = '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"'
    "sec-ch-ua-mobile" = "?0"
    "sec-ch-ua-platform" = '"Windows"'
    "sec-fetch-dest" = "document"
    "sec-fetch-mode" = "navigate"
    "sec-fetch-site" = "same-origin"
    "sec-fetch-user" = "?1"
    "upgrade-insecure-requests" = "1"
  }

  $response = Invoke-WebRequest -UseBasicParsing -Uri "https://autopromote-1.onrender.com/" -WebSession $session -Headers $headers

  $summary = @()
  $summary += "StatusCode: $($response.StatusCode)"
  $summary += "StatusDescription: $($response.StatusDescription)"
  $summary += "Headers:" + "`n" + ($response.Headers.GetEnumerator() | ForEach-Object { "$($_.Name): $($_.Value)" } | Out-String)
  $summary += "--- Content start ---"
  $summary += $response.Content
  $summary += "--- Content end ---"

  $summary -join "`n" | Out-File -FilePath $outFile -Encoding utf8
  Write-Output "Saved response to: $outFile"
  Write-Output "Status: $($response.StatusCode) $($response.StatusDescription)"
} catch {
  "Error: $($_.Exception.Message)" | Out-File -FilePath $outFile -Encoding utf8
  Write-Error "Request failed: $($_.Exception.Message). See $outFile for details."
  exit 1
}