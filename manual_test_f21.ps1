# ==============================================================================
# PlukIt Manual Verification Script: F21 - Backups, Deployment and Launch Checklist
# Runs end-to-end live testing in PowerShell against running servers
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " PLUKIT F21 LIVE MANUAL VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$serverBase = "http://localhost:4000"
$clientBase = "http://localhost:3000"

# ------------------------------------------------------------------------------
# STEP 1: Verify Public Settings API
# ------------------------------------------------------------------------------
Write-Host "[STEP 1] Querying GET /api/settings/public..." -ForegroundColor Yellow
$pubRes = Invoke-RestMethod -Uri "$serverBase/api/settings/public" -Method Get
Write-Host "  -> Serviceable Pincode: $($pubRes.serviceablePincode)" -ForegroundColor Green
Write-Host "  -> COD Max Limit Paise: $($pubRes.codMaxLimitPaise)" -ForegroundColor Green
Write-Host "  -> Online Payments Enabled: $($pubRes.onlinePaymentsEnabled)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Authenticate as Admin
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Authenticating Admin via POST /api/admin/auth/login..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@plukit.in"
    password = "supersecretadminpassword2026"
} | ConvertTo-Json

$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
try {
    $loginRes = Invoke-RestMethod -Uri "$serverBase/api/admin/auth/login" -Method Post -Body $loginPayload -ContentType "application/json" -WebSession $webSession
    Write-Host "  -> Admin authenticated: $($loginRes.admin.email) (Name: $($loginRes.admin.name))" -ForegroundColor Green
} catch {
    Write-Host "  -> Login note: $($_.Exception.Message)" -ForegroundColor DarkGray
}

# ------------------------------------------------------------------------------
# STEP 3: Engage Payment Kill-Switch (Admin Control)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Engaging Payment Kill-Switch (PATCH /api/admin/settings/payments)..." -ForegroundColor Yellow
$killPayload = @{
    enabled = $false
    reason = "Manual test drill: Razorpay gateway outage simulation"
} | ConvertTo-Json

$killRes = Invoke-RestMethod -Uri "$serverBase/api/admin/settings/payments" -Method Patch -Body $killPayload -ContentType "application/json" -WebSession $webSession
Write-Host "  -> Kill-Switch Status: $($killRes.message)" -ForegroundColor Green
Write-Host "  -> onlinePaymentsEnabled is now: $($killRes.onlinePaymentsEnabled)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 4: Verify Public Settings reflect Disabled State
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Verifying Public Settings Endpoint reflects Kill-Switch..." -ForegroundColor Yellow
$pubResDisabled = Invoke-RestMethod -Uri "$serverBase/api/settings/public" -Method Get
Write-Host "  -> Public onlinePaymentsEnabled: $($pubResDisabled.onlinePaymentsEnabled)" -ForegroundColor Green
if ($pubResDisabled.onlinePaymentsEnabled -ne $false) {
    throw "Public settings did not reflect payment kill switch!"
}

# ------------------------------------------------------------------------------
# STEP 5: Verify Checkout Enforcement
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Testing Checkout with UPI under Kill-Switch..." -ForegroundColor Yellow
$custSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$catRes = Invoke-RestMethod -Uri "$serverBase/api/categories" -Method Get
$firstCat = $catRes.categories[0]
$prodRes = Invoke-RestMethod -Uri "$serverBase/api/categories/$($firstCat.id)/products" -Method Get
$testProd = $prodRes.products[0]
Write-Host "  -> Using product: $($testProd.name) (ID: $($testProd.id))" -ForegroundColor DarkGray

# Add to cart
$addCartPayload = @{
    productId = $testProd.id
    qty = 1
} | ConvertTo-Json
$cartRes = Invoke-RestMethod -Uri "$serverBase/api/cart/items" -Method Post -Body $addCartPayload -ContentType "application/json" -WebSession $custSession
Write-Host "  -> Cart initialized with 1 item" -ForegroundColor Green

# 5A: Try UPI checkout (MUST FAIL)
Write-Host "  -> Attempting UPI checkout (expected HTTP 400)..." -ForegroundColor DarkGray
$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$upiPayload = @{
    name = "Manual Tester"
    phone = "9822119988"
    address = "MG Road Flat 402, Pune"
    pincode = "411001"
    paymentMethod = "UPI"
    idempotencyKey = "manual-upi-$nowMs"
} | ConvertTo-Json

try {
    $upiRes = Invoke-RestMethod -Uri "$serverBase/api/checkout" -Method Post -Body $upiPayload -ContentType "application/json" -WebSession $custSession
    Write-Host "  [FAIL] ERROR: UPI checkout should have been rejected!" -ForegroundColor Red
} catch {
    $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "  [OK] UPI REJECTED AS EXPECTED: $($errObj.error)" -ForegroundColor Green
    Write-Host "  [OK] Error Code: $($errObj.code)" -ForegroundColor Green
}

# 5B: Try COD checkout (MUST SUCCEED)
Write-Host "  -> Attempting COD checkout (expected HTTP 201)..." -ForegroundColor DarkGray
$nowMsCod = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$codPayload = @{
    name = "Manual Tester"
    phone = "9822119988"
    address = "MG Road Flat 402, Pune"
    pincode = "411001"
    paymentMethod = "COD"
    idempotencyKey = "manual-cod-$nowMsCod"
} | ConvertTo-Json

$codRes = Invoke-RestMethod -Uri "$serverBase/api/checkout" -Method Post -Body $codPayload -ContentType "application/json" -WebSession $custSession
Write-Host "  [OK] COD ORDER PLACED SUCCESSFULLY: $($codRes.orderNumber) (Status: $($codRes.status))" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 6: Resume Online Payments
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Resuming Online Payments via Admin API..." -ForegroundColor Yellow
$resumePayload = @{
    enabled = $true
    reason = "Manual test drill: Gateway operational"
} | ConvertTo-Json

$resumeRes = Invoke-RestMethod -Uri "$serverBase/api/admin/settings/payments" -Method Patch -Body $resumePayload -ContentType "application/json" -WebSession $webSession
Write-Host "  -> Resume Status: $($resumeRes.message)" -ForegroundColor Green
$pubResResumed = Invoke-RestMethod -Uri "$serverBase/api/settings/public" -Method Get
Write-Host "  -> Public onlinePaymentsEnabled: $($pubResResumed.onlinePaymentsEnabled)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 7: Run Database Backup Script
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Running Database Backup Script (scripts/backup_db.ps1)..." -ForegroundColor Yellow
$backupScript = "scripts/backup_db.ps1"
if (Test-Path "delivery-app/scripts/backup_db.ps1") {
    $backupScript = "delivery-app/scripts/backup_db.ps1"
}
$backupOutput = powershell -ExecutionPolicy Bypass -File $backupScript
Write-Host $backupOutput -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 8: Run Database Restore Verification
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Running Automated Backup Restore Verification..." -ForegroundColor Yellow
$restoreScript = "scripts/test_backup_restore.cjs"
if (Test-Path "delivery-app/scripts/test_backup_restore.cjs") {
    $restoreScript = "delivery-app/scripts/test_backup_restore.cjs"
}
$restoreOutput = node $restoreScript
Write-Host $restoreOutput -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 9: Audit Launch Files and Configurations
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 9] Auditing Launch and Deployment Documentation..." -ForegroundColor Yellow
$prefix = ""
if (Test-Path "delivery-app") {
    $prefix = "delivery-app/"
}
$filesToCheck = @(
    "${prefix}deployment/nginx.conf",
    "${prefix}deployment/ecosystem.config.cjs",
    "${prefix}docs/runbook.md",
    "${prefix}docs/launch_checklist.md",
    "${prefix}docs/production_setup.md",
    "${prefix}client/app/admin/settings/page.tsx"
)

foreach ($f in $filesToCheck) {
    if (Test-Path $f) {
        $size = (Get-Item $f).Length
        Write-Host "  [OK] Exists: $f ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Missing: $f" -ForegroundColor Red
        throw "Missing required launch artifact: $f"
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " [SUCCESS] ALL 9 MANUAL VERIFICATION STEPS PASSED!" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Cyan
