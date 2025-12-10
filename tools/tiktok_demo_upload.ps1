# PowerShell helper: POST to /api/tiktok/upload (demo mode)
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\tools\tiktok_demo_upload.ps1 -BaseUrl "http://localhost:3000" -IdToken "<FIREBASE_ID_TOKEN>"
# If backend is running with TIKTOK_DEMO_MODE=true this will print the demo JSON response.
param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$IdToken = "",
    [string]$VideoUrl = "https://example.com/sample.mp4",
    [string]$Title = "Demo upload"
)

$endpoint = "$BaseUrl/api/tiktok/upload"
Write-Host "POSTing to: $endpoint"

$body = @{ access_token = "demo"; open_id = "demo_openid"; video_url = $VideoUrl; title = $Title } | ConvertTo-Json

$headers = @{
    'Content-Type' = 'application/json'
}
if ($IdToken -ne "") { $headers['Authorization'] = "Bearer $IdToken" }

try {
    $res = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -Headers $headers -ErrorAction Stop
    Write-Host "Response:`n" -ForegroundColor Green
    $res | ConvertTo-Json -Depth 5 | Write-Host
} catch {
    Write-Host "Request failed:" -ForegroundColor Red
    $_.Exception.Response | ForEach-Object {
        try { (Get-Content -Raw -Encoding UTF8 $_) | Write-Host } catch { Write-Host $_ }
    }
}
