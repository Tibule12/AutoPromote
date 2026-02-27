# Live Watch - Game Economy & System Monitor
# Usage: ./live_watch.ps1

$LogFile = "logs/access-2026-02-25.log"  # Adjust date dynamically in real usage if needed
if (-not (Test-Path $LogFile)) {
    # Try to find the latest log file
    $LogFile = Get-ChildItem "logs/access-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}

if (-not $LogFile) {
    Write-Host "No log file found in logs/" -ForegroundColor Red
    exit
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   🎮 AUTO-PROMOTE LIVE OPS DASHBOARD" -ForegroundColor Yellow
Write-Host "   Monitoring: $LogFile" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Waiting for live events..." -ForegroundColor Gray

# Configuration
$CreditMap = @{
    "/api/media/render-clip" = 50
    "/api/clips" = 30
    "/api/content/quality-check" = 5
    "/api/viral/boost" = 100
}

Get-Content $LogFile -Wait -Tail 20 | ForEach-Object {
    $line = $_
    $ts = (Get-Date).ToString("HH:mm:ss")
    
    if ($line -match "OPTIONS") { return } # Skip pre-flight noise

    if ($line -match "GET /api/health.*status=200") {
        Write-Host "[$ts] ❤️  System Health Check: OK" -ForegroundColor Green
    }
    elseif ($line -match "POST /api/auth/login") {
        Write-Host "[$ts] 👤  New User Login detected" -ForegroundColor Cyan
    }
    elseif ($line -match "GET /api/users/me") {
        # Periodic auth check
        # Write-Host "[$ts] 👤  User Session Active" -ForegroundColor Gray
    }
    elseif ($line -match "POST /api/content/upload") {
        Write-Host "[$ts] 📹  NEW VIDEO UPLOAD DETECTED!" -ForegroundColor Magenta -BackgroundColor Black
    }
    elseif ($line -match "GET /api/notifications") {
        if ($line -notmatch "status=304") {
            Write-Host "[$ts] 🔔  Notification Alert Sent" -ForegroundColor Yellow
        }
    }
    elseif ($line -match "POST /api/payments/payfast/notify") {
         Write-Host "[$ts] 💰💰💰 REVENUE ALERT: PayFast Transaction!" -ForegroundColor Green -BackgroundColor Black
    }
    elseif ($line -match "POST /api/credits/purchase") {
         Write-Host "[$ts] 💳  Credit Pack Purchased" -ForegroundColor Green
    }
    else {
        # Check for credit usage
        $matched = $false
        foreach ($key in $CreditMap.Keys) {
            if ($line -match $key) {
                $cost = $CreditMap[$key]
                Write-Host "[$ts] 💎  CREDIT SPEND: ~$cost credits deducted (Action: $key)" -ForegroundColor Yellow
                $matched = $true
                break
            }
        }
        
        if (-not $matched) {
             # Clean up raw log line for display
             if ($line -match "POST /api/clips") {
                Write-Host "[$ts] 🎬  Video Analysis Job Started" -ForegroundColor Magenta
             }
             elseif ($line -match "\[ACCESS\]") {
                $parts = $line -split " "
                if ($parts.Length -ge 5) {
                    $method = $parts[2]
                    $path = $parts[3]
                    $statusRaw = $parts[4]
                    $status = $statusRaw -replace "status=", ""
                    $responseTime = ""
                    if ($line -match "responseTimeMS=(\d+)") {
                        $responseTime = "($matches[1]ms)"
                    }
                    
                    if ($status -match "2\d\d" -or $status -match "304") {
                         # Standard success, keep it subtle
                         if ($path -notmatch "/health" -and $path -notmatch "/notifications") {
                            Write-Host "[$ts] ✅ $method $path $status $responseTime" -ForegroundColor Green
                         }
                    } elseif ($status -match "4\d\d") {
                        Write-Host "[$ts] ⚠️  Warning: $method $path $status $responseTime" -ForegroundColor Yellow
                    } elseif ($status -match "5\d\d") {
                        Write-Host "[$ts] ❌ ERROR: $method $path $status $responseTime" -ForegroundColor Red
                    }
                }
             }
        }
    }
}