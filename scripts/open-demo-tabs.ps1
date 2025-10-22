# Open all tabs needed for the TikTok sandbox demo recording
# Usage: Right-click -> Run with PowerShell or run from an elevated/normal PS session

Start-Process "https://autopromote.onrender.com/.well-known/tiktok-developers-site-verification.txt"
Start-Process "https://autopromote.onrender.com/tiktokSATLrymQBGL5NQDmpwRAzSEwTk8iWP3F.txt"
Start-Process "https://autopromote.onrender.com/tiktok-demo"
Start-Process "http://127.0.0.1:8081/tiktok-demo.html"
Start-Process "http://127.0.0.1:8081/mock/tiktok_oauth_frontend.html"

Write-Host "Opened demo tabs. Make sure http://localhost:8082 mock backend is running in another terminal." -ForegroundColor Green
