# TC-XCC-LOAD-003 — runner for sync-flaky-network.js
#
# Prereqs (run once):
#   scoop install toxiproxy        # or download from github.com/Shopify/toxiproxy
#   npm i -D @supabase/supabase-js # already in repo
#
# In one terminal:  toxiproxy-server
# In another:       see the toxic creation block below (commented out — paste manually).
#
# Usage:
#   ./load-tests/run-sync-flaky.ps1                          # 200 reqs through proxy
#   ./load-tests/run-sync-flaky.ps1 -QueueSize 500
#   ./load-tests/run-sync-flaky.ps1 -NoProxy                 # baseline (no chaos)

param(
  [int]$QueueSize  = 50,
  [int]$MaxAttempts = 6,
  [switch]$NoProxy,
  [switch]$Chaos          # client-side chaos (no toxiproxy needed)
)

# Edit these to match your staging project
$env:SUPABASE_URL              = "https://dfwqakoyittmrwbqvxgw.supabase.co"
$env:SUPABASE_ANON_KEY         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmd3Fha295aXR0bXJ3YnF2eGd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk2MjYsImV4cCI6MjA5MDg4NTYyNn0.QEHjVDajR1Q_yrh8v2KAzIHaBVYD5UpTJiH42I3_3fo"
# Service role key — DO NOT commit. Set this in your shell before running:
#   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "ERROR: set `$env:SUPABASE_SERVICE_ROLE_KEY before running" -ForegroundColor Red
  exit 1
}
$env:STORE_CONFIG_ID  = "d46226d5-30c1-4c3f-a79c-47e812edac09"
$env:MENU_ITEM_ID     = "8ec036b3-085c-4b6c-8cd9-a2189b913a02"
$env:MENU_ITEM_NAME   = "Test Audit Item"
$env:MENU_ITEM_PRICE  = "10.00"
$env:QUEUE_SIZE       = "$QueueSize"
$env:MAX_ATTEMPTS     = "$MaxAttempts"

if ($Chaos) { $env:CHAOS = "1" } else { $env:CHAOS = "0" }

if ($NoProxy) {
  $env:USE_PROXY = "0"
  if ($Chaos) {
    Write-Host "Running WITHOUT toxiproxy, WITH client-side chaos" -ForegroundColor Yellow
  } else {
    Write-Host "Running WITHOUT toxiproxy (baseline)" -ForegroundColor Yellow
  }
} else {
  $env:USE_PROXY = "1"
  $env:PROXY_URL = "http://127.0.0.1:54320"
  Write-Host "Running THROUGH toxiproxy at $env:PROXY_URL" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "If you have not yet configured toxics, run these in another terminal:" -ForegroundColor DarkGray
  Write-Host "  toxiproxy-cli create -l 127.0.0.1:54320 -u dfwqakoyittmrwbqvxgw.supabase.co:443 supabase" -ForegroundColor DarkGray
  Write-Host "  toxiproxy-cli toxic add supabase -t latency    -a latency=500 -a jitter=200" -ForegroundColor DarkGray
  Write-Host "  toxiproxy-cli toxic add supabase -t timeout    -a timeout=8000  --toxicity 0.20" -ForegroundColor DarkGray
  Write-Host "  toxiproxy-cli toxic add supabase -t reset_peer -a timeout=2000 --toxicity 0.30" -ForegroundColor DarkGray
}

node load-tests/sync-flaky-network.js
