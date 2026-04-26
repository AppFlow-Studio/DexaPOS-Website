# TC-XCC-LOAD-002 — runner for realtime-fanout.js
#
# Usage:
#   ./load-tests/run-realtime-fanout.ps1                    # default channel = orders
#   ./load-tests/run-realtime-fanout.ps1 -Channel menu_items
#   ./load-tests/run-realtime-fanout.ps1 -Vus 500           # smaller run

param(
  [string]$Channel = "orders",
  [string]$Schema  = "public",
  [int]$Vus        = 1000
)

$env:SUPABASE_URL       = "wss://dfwqakoyittmrwbqvxgw.supabase.co/realtime/v1/websocket"
$env:SUPABASE_ANON_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmd3Fha295aXR0bXJ3YnF2eGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk2MjYsImV4cCI6MjA5MDg4NTYyNn0.QEHjVDajR1Q_yrh8v2KAzIHaBVYD5UpTJiH42I3_3fo"
$env:CHANNEL            = $Channel
$env:SCHEMA             = $Schema
$env:TARGET_VUS         = "$Vus"

Write-Host "Running realtime fan-out test:" -ForegroundColor Cyan
Write-Host "  Project : dfwqakoyittmrwbqvxgw"
Write-Host "  Channel : $Schema.$Channel"
Write-Host "  VUs     : $Vus"
Write-Host ""
Write-Host "While the test is in the 'hold' phase, fire DB events from the Supabase SQL editor:"
Write-Host "  INSERT INTO $Channel (...) VALUES (...);" -ForegroundColor Yellow
Write-Host ""

k6 run --summary-export=load-tests/realtime-fanout-summary.json load-tests/realtime-fanout.js
