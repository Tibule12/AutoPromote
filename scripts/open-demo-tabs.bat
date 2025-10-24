@echo off
:: Open demo and verification URLs in default browser (Windows)
start "" "https://autopromote.onrender.com/.well-known/tiktok-developers-site-verification.txt"
start "" "https://autopromote.onrender.com/tiktokSATLrymQBGL5NQDmpwRAzSEwTk8iWP3F.txt"
start "" "https://autopromote.onrender.com/tiktok-demo"
start "" "http://127.0.0.1:8081/tiktok-demo.html"
start "" "http://127.0.0.1:8081/mock/tiktok_oauth_frontend.html"

echo Opened demo tabs. Make sure the mock backend is running at http://localhost:8082
pause