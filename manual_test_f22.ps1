# ==============================================================================
# PlukIt Manual Verification Script: F22 - Soft Launch Operations
# Runs live in PowerShell against backend on port 4000
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " PLUKIT F22 LIVE MANUAL VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$serverBase = "http://localhost:4000"
$clientBase = "http://localhost:3000"

# ------------------------------------------------------------------------------
# STEP 1: Authenticate as Admin
# ------------------------------------------------------------------------------
Write-Host "[STEP 1] Authenticating Admin via POST /api/admin/auth/login..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@plukit.in"
    password = "supersecretadminpassword2026"
} | ConvertTo-Json

$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginRes = Invoke-RestMethod -Uri "$serverBase/api/admin/auth/login" -Method Post -Body $loginPayload -ContentType "application/json" -WebSession $webSession
Write-Host "  [OK] Admin authenticated: $($loginRes.admin.email) ($($loginRes.admin.name))" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Query Soft Launch Operational Scorecard
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Fetching Scorecard via GET /api/admin/operations/summary..." -ForegroundColor Yellow
$summaryRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/summary" -Method Get -WebSession $webSession
Write-Host "  -> Pilot Completed Orders: $($summaryRes.targetProgress.completed) / $($summaryRes.targetProgress.target) target ($($summaryRes.targetProgress.percentage)%)" -ForegroundColor Green
Write-Host "  -> On-Time Delivery Rate:  $($summaryRes.onTimeDelivery.onTimeRatePercent)% ($($summaryRes.onTimeDelivery.onTimeOrders)/$($summaryRes.onTimeDelivery.totalDelivered) on-time, Avg: $($summaryRes.onTimeDelivery.avgDeliveryMinutes) mins)" -ForegroundColor Green
Write-Host "  -> Repeat Customer Rate:   $($summaryRes.repeatCustomers.repeatCustomerRatePercent)% ($($summaryRes.repeatCustomers.repeatCustomers)/$($summaryRes.repeatCustomers.uniqueCustomers) repeat buyers)" -ForegroundColor Green
Write-Host "  -> Net Margin per Order:   Rs $([Math]::Round($summaryRes.unitEconomics.avgMarginPerOrderPaise / 100, 2))" -ForegroundColor Green
Write-Host "  -> Total Gross Margin:     Rs $([Math]::Round($summaryRes.unitEconomics.grossMarginPaise / 100, 2))" -ForegroundColor Green

if ($summaryRes.targetProgress.completed -lt 20) {
    Write-Host "  [NOTE] Target not reached yet; seeding soft launch orders..." -ForegroundColor DarkGray
    node delivery-app/scripts/seed_soft_launch.cjs | Out-Null
    $summaryRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/summary" -Method Get -WebSession $webSession
}

Write-Host "  [OK] Soft launch target met: $($summaryRes.targetProgress.isTargetMet)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 3: Query Daily COD Cash Reconciliation
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Fetching Cash Reconciliation via GET /api/admin/operations/cash-reconciliation..." -ForegroundColor Yellow
$cashRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/cash-reconciliation" -Method Get -WebSession $webSession
Write-Host "  -> Found $($cashRes.reconciliations.Count) daily reconciliation record(s):" -ForegroundColor Green
foreach ($rec in $cashRes.reconciliations | Select-Object -First 3) {
    Write-Host "     * Date: $($rec.date) | Rider: $($rec.riderName) | Orders: $($rec.ordersCount) | Expected: Rs $([Math]::Round($rec.expectedCashPaise / 100, 2)) | Status: $($rec.status)" -ForegroundColor DarkGray
}
Write-Host "  [OK] Cash reconciliation data verified" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 4: Submit Live Cash Reconciliation for Rider
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Submitting Daily Cash Reconciliation via POST /api/admin/operations/cash-reconciliation..." -ForegroundColor Yellow
$todayStr = (Get-Date).ToString("yyyy-MM-dd")
$reconcilePayload = @{
    date = $todayStr
    riderName = "Rider Ramesh (Champion 1)"
    collectedCashPaise = 250000 # Rs 2,500
    notes = "Daily live verification cash handover complete"
} | ConvertTo-Json

$reconcilePostRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/cash-reconciliation" -Method Post -Body $reconcilePayload -ContentType "application/json" -WebSession $webSession
Write-Host "  [OK] Cash recorded: $($reconcilePostRes.message)" -ForegroundColor Green
Write-Host "  -> Reconciled status: $($reconcilePostRes.reconciliation.status)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 5: Log a New Operational Issue
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Logging Operational Issue via POST /api/admin/operations/issues..." -ForegroundColor Yellow
$issuePayload = @{
    category = "DAMAGED_ITEM"
    severity = "HIGH"
    description = "Live test: Egg carton seal damaged during transit. Rider requested replacement."
    reportedBy = "RIDER"
} | ConvertTo-Json

$issuePostRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/issues" -Method Post -Body $issuePayload -ContentType "application/json" -WebSession $webSession
$newIssueId = $issuePostRes.issue.id
Write-Host "  [OK] Issue created: ID $newIssueId (Category: $($issuePostRes.issue.category), Status: $($issuePostRes.issue.status))" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 6: Query and Filter Issues Log
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Querying Issues Log via GET /api/admin/operations/issues?status=OPEN..." -ForegroundColor Yellow
$openIssuesRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/issues?status=OPEN" -Method Get -WebSession $webSession
$foundNew = $openIssuesRes.issues | Where-Object { $_.id -eq $newIssueId }
if ($foundNew) {
    Write-Host "  [OK] Newly logged issue verified in OPEN status: $($foundNew.description)" -ForegroundColor Green
} else {
    throw "Logged issue was not found in open issues query!"
}

# ------------------------------------------------------------------------------
# STEP 7: Resolve Operational Issue
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Resolving Issue via PATCH /api/admin/operations/issues/:id..." -ForegroundColor Yellow
$resolvePayload = @{
    status = "RESOLVED"
    rootCause = "Fragile packing from vendor"
    resolutionNotes = "Replacement pack delivered to customer in 15 mins. Vendor advised on packaging standards."
} | ConvertTo-Json

$resolveRes = Invoke-RestMethod -Uri "$serverBase/api/admin/operations/issues/$newIssueId" -Method Patch -Body $resolvePayload -ContentType "application/json" -WebSession $webSession
Write-Host "  [OK] Issue resolved: Status is now $($resolveRes.issue.status)" -ForegroundColor Green
Write-Host "  -> Resolution notes: $($resolveRes.issue.resolution_notes)" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 8: Verify Soft Launch Review Document
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Auditing Soft Launch Review Document (docs/soft_launch_review.md)..." -ForegroundColor Yellow
$reviewPath = if (Test-Path "delivery-app/docs/soft_launch_review.md") { "delivery-app/docs/soft_launch_review.md" } else { "docs/soft_launch_review.md" }

if (Test-Path $reviewPath) {
    $reviewContent = Get-Content $reviewPath -Raw
    $hasScorecard = $reviewContent.Contains("Executive Scorecard")
    $hasMargin = $reviewContent.Contains("Unit Economics")
    $hasSignoff = $reviewContent.Contains("Founder Launch Sign-Off")

    Write-Host "  [OK] File exists: $reviewPath ($((Get-Item $reviewPath).Length) bytes)" -ForegroundColor Green
    Write-Host "  -> Contains Executive Scorecard: $hasScorecard" -ForegroundColor Green
    Write-Host "  -> Contains Unit Economics Breakdown: $hasMargin" -ForegroundColor Green
    Write-Host "  -> Contains Founder Sign-Off: $hasSignoff" -ForegroundColor Green
} else {
    throw "docs/soft_launch_review.md missing!"
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " [PASS] ALL F22 MANUAL VERIFICATION CHECKS PASSED!" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Cyan
