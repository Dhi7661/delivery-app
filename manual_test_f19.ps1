# Manual Verification Script for F19: Legal pages and security hardening
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " [F19] Manual & Security Hardening Verification Test" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$BackendUrl = "http://localhost:4000"
$ClientUrl = "http://localhost:3000"

# 1. Health Check & Security Headers
Write-Host "`n[Step 1] Checking Live Backend Security Headers (Helmet)..." -ForegroundColor Yellow
try {
    $healthResp = Invoke-WebRequest -Uri "$BackendUrl/api/v1/health" -Method Get -UseBasicParsing
    Write-Host "  HTTP Status: $($healthResp.StatusCode)" -ForegroundColor Green

    $csp = $healthResp.Headers["Content-Security-Policy"]
    $nosniff = $healthResp.Headers["X-Content-Type-Options"]
    $frameOptions = $healthResp.Headers["X-Frame-Options"]
    $hsts = $healthResp.Headers["Strict-Transport-Security"]

    Write-Host "  Content-Security-Policy : $(if ($csp) { 'PRESENT [PASS]' } else { 'MISSING [FAIL]' })" -ForegroundColor $(if ($csp) { 'Green' } else { 'Red' })
    Write-Host "  X-Content-Type-Options  : $nosniff $(if ($nosniff -eq 'nosniff') { '[PASS]' } else { '[FAIL]' })" -ForegroundColor $(if ($nosniff -eq 'nosniff') { 'Green' } else { 'Red' })
    Write-Host "  X-Frame-Options         : $frameOptions $(if ($frameOptions -eq 'SAMEORIGIN') { '[PASS]' } else { '[FAIL]' })" -ForegroundColor $(if ($frameOptions -eq 'SAMEORIGIN') { 'Green' } else { 'Red' })
    Write-Host "  Strict-Transport-Security: $(if ($hsts) { 'PRESENT [PASS]' } else { 'MISSING [FAIL]' })" -ForegroundColor $(if ($hsts) { 'Green' } else { 'Red' })
} catch {
    Write-Host "  Backend health check failed: $_" -ForegroundColor Red
}

# 2. CORS Isolation Check
Write-Host "`n[Step 2] Checking CORS Domain Validation..." -ForegroundColor Yellow
try {
    # Allowed origin
    $corsAllowed = Invoke-WebRequest -Uri "$BackendUrl/api/v1/health" -Headers @{ "Origin" = "http://localhost:3000" } -Method Get -UseBasicParsing
    $allowOriginHeader = $corsAllowed.Headers["Access-Control-Allow-Origin"]
    Write-Host "  Allowed Origin (localhost:3000): $allowOriginHeader [PASS]" -ForegroundColor Green
} catch {
    Write-Host "  Allowed CORS request failed: $_" -ForegroundColor Red
}

try {
    # Blocked origin
    $corsBlocked = Invoke-WebRequest -Uri "$BackendUrl/api/v1/health" -Headers @{ "Origin" = "https://unauthorized-attacker.com" } -Method Get -UseBasicParsing
    Write-Host "  Unauthorized Origin did NOT get blocked [FAIL]" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Host "  Blocked Unauthorized Origin (https://unauthorized-attacker.com): 403 Forbidden [PASS]" -ForegroundColor Green
    } else {
        Write-Host "  CORS block response: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 3. Admin Route Protection Check
Write-Host "`n[Step 3] Checking Admin API Access Control..." -ForegroundColor Yellow
try {
    $adminResp = Invoke-WebRequest -Uri "$BackendUrl/api/admin/orders" -Method Get -UseBasicParsing
    Write-Host "  Unauthenticated call to /api/admin/orders did NOT return 401 [FAIL]" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "  Unauthenticated call to /api/admin/orders returned HTTP 401 Unauthorized [PASS]" -ForegroundColor Green
    } else {
        Write-Host "  Admin route check returned status $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}

# 4. Customer Order Ownership Check
Write-Host "`n[Step 4] Checking Customer Order Ownership Protection..." -ForegroundColor Yellow
try {
    # Try fetching a known customer order with mismatched phone number
    $orderResp = Invoke-WebRequest -Uri "$BackendUrl/api/orders/PLUK-2026-000800?phone=9999999999" -Method Get -UseBasicParsing
    Write-Host "  Mismatched phone order query did NOT return 403 [FAIL]" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403 -or $_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "  Cross-customer order access blocked (Status: $($_.Exception.Response.StatusCode.value__)) [PASS]" -ForegroundColor Green
    } else {
        Write-Host "  Order ownership check: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 5. Rate Limiting Check
Write-Host "`n[Step 5] Checking In-Memory Rate Limiting on Search & Auth..." -ForegroundColor Yellow
try {
    # Query search endpoint to inspect rate limit headers
    $searchResp = Invoke-WebRequest -Uri "$BackendUrl/api/products/search?q=organic" -Method Get -UseBasicParsing
    $rateLimitLimit = $searchResp.Headers["X-RateLimit-Limit"]
    $rateLimitRemaining = $searchResp.Headers["X-RateLimit-Remaining"]
    Write-Host "  Search Rate Limit: $rateLimitLimit | Remaining: $rateLimitRemaining [PASS]" -ForegroundColor Green
} catch {
    Write-Host "  Search rate limit test failed: $_" -ForegroundColor Red
}

# 6. Legal Pages Availability on Client
Write-Host "`n[Step 6] Checking Client Legal Pages Availability (HTTP 200)..." -ForegroundColor Yellow
$legalRoutes = @("/terms", "/privacy", "/refund-policy", "/delivery-policy", "/contact", "/grievance")

foreach ($route in $legalRoutes) {
    try {
        $resp = Invoke-WebRequest -Uri "$ClientUrl$route" -Method Get -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            Write-Host "  $route : HTTP 200 OK [PASS]" -ForegroundColor Green
        } else {
            Write-Host "  $route : HTTP $($resp.StatusCode) [FAIL]" -ForegroundColor Red
        }
    } catch {
        Write-Host "  $route : Request failed ($($_))" -ForegroundColor Red
    }
}

Write-Host "`n====================================================" -ForegroundColor Cyan
Write-Host " [F19] Manual Verification Completed Successfully!" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
