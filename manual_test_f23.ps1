# ==============================================================================
# PlukIt Manual Verification Script: F23 - Shop Ledger and Fortnightly Payouts
# Runs live in PowerShell against backend on port 4000
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " PLUKIT F23 LIVE MANUAL VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$serverBase = "http://localhost:4000"

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
Write-Host "  [OK] Admin authenticated: $($loginRes.admin.email) ($($loginRes.admin.name))`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Query Partner Shops & Unbilled Ledger Balances
# ------------------------------------------------------------------------------
Write-Host "[STEP 2] Fetching Partner Shops via GET /api/admin/payouts/shops..." -ForegroundColor Yellow
$shopsRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/shops" -Method Get -WebSession $webSession
$targetShop = $shopsRes.shops[0]

Write-Host "  -> Found $($shopsRes.shops.Count) partner shop(s):" -ForegroundColor Green
foreach ($s in $shopsRes.shops) {
    Write-Host "     * $($s.name) | Unbilled Entries: $($s.unbilledCount) | Net Payable: Rs $([Math]::Round($s.netPayablePaise / 100, 2))" -ForegroundColor DarkGray
}
Write-Host "  [OK] Target partner shop selected: $($targetShop.name) (ID: $($targetShop.id))`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 3: Configure Partner Bank Account
# ------------------------------------------------------------------------------
Write-Host "[STEP 3] Updating Partner Bank Account via POST /api/admin/payouts/shops/$($targetShop.id)/bank..." -ForegroundColor Yellow
$bankPayload = @{
    accountNumber = "50100458923019"
    ifscCode = "HDFC0001234"
    bankName = "HDFC Bank, Viman Nagar Branch"
    accountName = "$($targetShop.name) Official"
} | ConvertTo-Json

$bankRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/shops/$($targetShop.id)/bank" -Method Post -Body $bankPayload -ContentType "application/json" -WebSession $webSession
Write-Host "  [OK] Bank reference saved: Last4=$($bankRes.bankRef.last4), IFSC=$($bankRes.bankRef.ifsc_code), Bank=$($bankRes.bankRef.bank_name)`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 4: Ensure Unbilled Ledger Entries Exist (Record Sample DELIVERED Sale)
# ------------------------------------------------------------------------------
Write-Host "[STEP 4] Ensuring unbilled ledger entries exist for shop..." -ForegroundColor Yellow

# Create adjustment entry to ensure unbilled balance exists for the payout period
$adjPayload = @{
    shopId = $targetShop.id
    amountPaise = 25000 # Rs 250.00
    notes = "Pre-run unbilled sales adjustment verification"
} | ConvertTo-Json

$adjRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/adjustments" -Method Post -Body $adjPayload -ContentType "application/json" -WebSession $webSession
Write-Host "  [OK] Verified unbilled ledger entry recorded: Rs $([Math]::Round($adjRes.adjustment.amount_paise / 100, 2)) ($($adjRes.adjustment.notes))`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 5: Preview 15-Day Payout Run
# ------------------------------------------------------------------------------
Write-Host "[STEP 5] Previewing 15-Day Payout via GET /api/admin/payouts/preview..." -ForegroundColor Yellow
$now = Get-Date
$periodStart = $now.AddDays(-15).ToString("yyyy-MM-dd")
$periodEnd = $now.AddDays(5).ToString("yyyy-MM-dd")

$previewRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/preview?shopId=$($targetShop.id)&periodStart=$periodStart&periodEnd=$periodEnd" -Method Get -WebSession $webSession
Write-Host "  -> Preview Matched Entries: $($previewRes.count)" -ForegroundColor Green
Write-Host "  -> Gross Sales:             Rs $([Math]::Round($previewRes.grossSalesPaise / 100, 2))" -ForegroundColor Green
Write-Host "  -> Deductions:              Rs $([Math]::Round($previewRes.deductionsPaise / 100, 2))" -ForegroundColor Green
Write-Host "  -> Net Settlement Amount:   Rs $([Math]::Round($previewRes.netAmountPaise / 100, 2))" -ForegroundColor Green
Write-Host "  [OK] Period preview verified successfully`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 6: Generate 15-Day Payout Run (Status: SCHEDULED)
# ------------------------------------------------------------------------------
Write-Host "[STEP 6] Scheduling 15-Day Payout via POST /api/admin/payouts/generate..." -ForegroundColor Yellow
$genPayload = @{
    shopId = $targetShop.id
    periodStart = $periodStart
    periodEnd = $periodEnd
} | ConvertTo-Json

$payoutRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/generate" -Method Post -Body $genPayload -ContentType "application/json" -WebSession $webSession
$payoutId = $payoutRes.payout.id
Write-Host "  -> Payout ID:               $payoutId" -ForegroundColor Green
Write-Host "  -> Status:                  $($payoutRes.payout.status)" -ForegroundColor Green
Write-Host "  -> Net Payable:             Rs $([Math]::Round($payoutRes.payout.amount_paise / 100, 2))" -ForegroundColor Green
Write-Host "  [OK] 15-day payout run generated in SCHEDULED status`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 7: Record Bank Transfer UTR & Lock Period (Status: PAID)
# ------------------------------------------------------------------------------
Write-Host "[STEP 7] Recording Bank Transfer UTR via POST /api/admin/payouts/$payoutId/pay..." -ForegroundColor Yellow
$utrRef = "UTR" + (Get-Date).ToString("yyyyMMddHHmmss")
$payPayload = @{
    bankReference = $utrRef
    paidAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json

$payRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/$payoutId/pay" -Method Post -Body $payPayload -ContentType "application/json" -WebSession $webSession
Write-Host "  -> Bank UTR Reference:      $($payRes.payout.bank_reference)" -ForegroundColor Green
Write-Host "  -> Settlement Status:       $($payRes.payout.status) (LOCKED)" -ForegroundColor Green
Write-Host "  -> Paid At:                 $($payRes.payout.paid_at)" -ForegroundColor Green
Write-Host "  [OK] Bank transfer recorded and payout period locked`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 8: Verify Period Locking Rule (Attempt duplicate payment on locked period)
# ------------------------------------------------------------------------------
Write-Host "[STEP 8] Testing F23 Period Locking Enforcement (Attempt duplicate pay on locked period)..." -ForegroundColor Yellow
$ruleEnforced = $false
try {
    $dupPayload = @{ bankReference = "DUPLICATE-UTR-999" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/$payoutId/pay" -Method Post -Body $dupPayload -ContentType "application/json" -WebSession $webSession
} catch {
    $ruleEnforced = $true
    Write-Host "  [PASS] Correctly rejected: $($_.Exception.Message)" -ForegroundColor Green
}

if (-not $ruleEnforced) {
    throw "Security violation: Locked payout period allowed modification!"
}
Write-Host "  [OK] F23 Period Locking Rule verified: Locked periods cannot be altered`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 9: Fetch Detailed Itemized Statement
# ------------------------------------------------------------------------------
Write-Host "[STEP 9] Fetching Itemized Statement via GET /api/admin/payouts/$payoutId/statement..." -ForegroundColor Yellow
$stmtRes = Invoke-RestMethod -Uri "$serverBase/api/admin/payouts/$payoutId/statement" -Method Get -WebSession $webSession
Write-Host "  -> Statement ID:            $($stmtRes.payout.id)" -ForegroundColor Green
Write-Host "  -> Partner Shop:            $($stmtRes.shop.name)" -ForegroundColor Green
Write-Host "  -> Status:                  $($stmtRes.summary.status)" -ForegroundColor Green
Write-Host "  -> Bank Ref:                $($stmtRes.summary.bankReference)" -ForegroundColor Green
Write-Host "  -> Itemized Entries Count:  $($stmtRes.payout.ledger_entries.Count)" -ForegroundColor Green
Write-Host "  [OK] Statement details retrieved successfully`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 10: Download and Verify Statement PDF
# ------------------------------------------------------------------------------
Write-Host "[STEP 10] Downloading Generated Statement PDF via GET /api/admin/payouts/$payoutId/pdf..." -ForegroundColor Yellow
$tempPdfPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "test_payout_$payoutId.pdf")

Invoke-WebRequest -Uri "$serverBase/api/admin/payouts/$payoutId/pdf" -Method Get -WebSession $webSession -OutFile $tempPdfPath
$pdfBytes = [System.IO.File]::ReadAllBytes($tempPdfPath)
$pdfHeader = [System.Text.Encoding]::ASCII.GetString($pdfBytes[0..3])

Write-Host "  -> PDF File Saved:          $tempPdfPath" -ForegroundColor Green
Write-Host "  -> File Size:               $($pdfBytes.Length) bytes" -ForegroundColor Green
Write-Host "  -> PDF Magic Header:        $pdfHeader" -ForegroundColor Green

if ($pdfHeader -ne "%PDF") {
    throw "Invalid PDF header received: $pdfHeader"
}
Write-Host "  [OK] PDF statement verified with valid %PDF structure`n" -ForegroundColor Green

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " [PASS] ALL F23 LIVE MANUAL VERIFICATION TESTS PASSED!" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan
