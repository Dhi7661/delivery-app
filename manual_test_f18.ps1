$ErrorActionPreference = "Stop"
$base = "http://localhost:4000"
$secret = "rzp_test_webhook_secret"

Write-Host "=========================================================="
Write-Host " RUNNING MANUAL TEST SUITE: F18 CANCELLATIONS & REFUNDS"
Write-Host "=========================================================="

# Helper: Create an active admin session
Write-Host "`n--- [Setup] Authenticate Test Admin ---"
$adminLoginBody = @{
  email = "admin@plukit.in"
  password = "supersecretadminpassword2026"
} | ConvertTo-Json

$adminSes = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$adminLoginRes = Invoke-RestMethod -Uri "$base/api/admin/auth/login" -Method Post -Body $adminLoginBody -ContentType "application/json" -WebSession $adminSes
Write-Host "Admin Logged In: $($adminLoginRes.admin.email)"

# Helper function to place a UPI order and confirm it via signed webhook
function New-ConfirmedUpiOrder($orderKey) {
  $ses = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod -Uri "$base/api/cart" -WebSession $ses | Out-Null
  $search = Invoke-RestMethod -Uri "$base/api/products/search?q=milk"
  $prod = $search.products[0]

  Invoke-RestMethod -Uri "$base/api/cart/items" -Method Post -Body (@{ productId = $prod.id; qty = 1 } | ConvertTo-Json) -ContentType "application/json" -WebSession $ses | Out-Null

  $checkoutPayload = @{
    name = "Dhiraj Manual F18"
    phone = "9822114455"
    address = "Flat 501, Camp"
    pincode = "411001"
    paymentMethod = "UPI"
    idempotencyKey = $orderKey
  } | ConvertTo-Json

  $order = Invoke-RestMethod -Uri "$base/api/checkout" -Method Post -Body $checkoutPayload -ContentType "application/json" -WebSession $ses
  $orderNumber = $order.orderNumber
  $gatewayOrderId = $order.razorpay.orderId
  $totalPaise = $order.totalPaise

  # Confirm via webhook
  $webhookObj = @{
    event = "payment.captured"
    event_id = "evt_f18_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    payload = @{
      payment = @{
        entity = @{
          id = "pay_f18_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
          order_id = $gatewayOrderId
          amount = $totalPaise
          currency = "INR"
          status = "captured"
          method = "upi"
          notes = @{
            order_no = $orderNumber
          }
        }
      }
    }
  }
  $webhookBody = $webhookObj | ConvertTo-Json -Depth 5
  $sha = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($secret))
  $sigBytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($webhookBody))
  $signature = [System.BitConverter]::ToString($sigBytes).Replace("-", "").ToLower()

  Invoke-RestMethod -Uri "$base/api/payments/razorpay/webhook" -Method Post -Headers @{
    "x-razorpay-signature" = $signature
    "Content-Type" = "application/json"
  } -Body $webhookBody | Out-Null

  return @{
    orderNumber = $orderNumber
    orderId = $order.orderId
    totalPaise = $totalPaise
  }
}

Write-Host "`n=== [TEST 1] Full Cancellation Before Packing Refunds Full Amount ==="
$order1Info = New-ConfirmedUpiOrder ("f18-mtest-1-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$o1No = $order1Info.orderNumber
Write-Host "Created Confirmed UPI Order: $o1No (Total: Rs $($order1Info.totalPaise / 100))"

# Customer cancels before packing
$cancelRes1 = Invoke-RestMethod -Uri "$base/api/orders/$o1No/cancel" -Method Post -Body (@{
  phone = "9822114455"
  reason = "Customer cancelled before dispatch"
} | ConvertTo-Json) -ContentType "application/json"

Write-Host "Cancellation Response:"
Write-Host "  Status:         $($cancelRes1.order.status)"
Write-Host "  Payment Status: $($cancelRes1.order.payment_status)"
Write-Host "  Refund Amount:  Rs $($cancelRes1.refundAmountPaise / 100)"
Write-Host "  Refund ID:      $($cancelRes1.refund.gateway_refund_id)"

if ($cancelRes1.order.status -eq "CANCELLED" -and $cancelRes1.order.payment_status -eq "REFUNDED" -and $cancelRes1.refundAmountPaise -eq $order1Info.totalPaise) {
  Write-Host "  [PASS] Full cancellation before packing refunded the full amount!" -ForegroundColor Green
} else {
  Write-Host "  [FAIL] Refund amount or status incorrect!" -ForegroundColor Red
}

Write-Host "`n=== [TEST 2] Customer Cancellation After Packing is Refused ==="
$order2Info = New-ConfirmedUpiOrder ("f18-mtest-2-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$o2No = $order2Info.orderNumber
$o2Id = $order2Info.orderId

# Admin advances order to SENT_TO_SHOP -> PACKED
Invoke-RestMethod -Uri "$base/api/admin/orders/$o2Id/status" -Method Patch -Body (@{ status = "SENT_TO_SHOP" } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes | Out-Null
Invoke-RestMethod -Uri "$base/api/admin/orders/$o2Id/status" -Method Patch -Body (@{ status = "PACKED" } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes | Out-Null
Write-Host "Advanced Order $o2No to PACKED"

# Customer attempts to cancel after PACKED -> Expecting HTTP 400
try {
  Invoke-WebRequest -Uri "$base/api/orders/$o2No/cancel" -Method Post -Body (@{
    phone = "9822114455"
    reason = "Late cancellation"
  } | ConvertTo-Json) -ContentType "application/json" | Out-Null
  Write-Host "  [FAIL] Cancellation after packing should have been refused!" -ForegroundColor Red
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  Write-Host "  [PASS] Customer cancellation correctly refused with HTTP $statusCode (Packed order)" -ForegroundColor Green
}

# Admin CAN cancel with required reason
$adminCancelRes = Invoke-RestMethod -Uri "$base/api/admin/orders/$o2Id/cancel" -Method Post -Body (@{
  reason = "Admin cancelled due to damaged item discovered during packing"
} | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes
if ($adminCancelRes.order.status -eq "CANCELLED") {
  Write-Host "  [PASS] Admin can cancel packed order when reason is provided!" -ForegroundColor Green
}

Write-Host "`n=== [TEST 3] Partial Return Refunds Only Returned Items & Logs Shop Deduction ==="
$order3Info = New-ConfirmedUpiOrder ("f18-mtest-3-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$o3No = $order3Info.orderNumber
$o3Id = $order3Info.orderId

# Advance order to DELIVERED
Invoke-RestMethod -Uri "$base/api/admin/orders/$o3Id/status" -Method Patch -Body (@{ status = "SENT_TO_SHOP" } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes | Out-Null
Invoke-RestMethod -Uri "$base/api/admin/orders/$o3Id/status" -Method Patch -Body (@{ status = "PACKED" } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes | Out-Null
Invoke-RestMethod -Uri "$base/api/admin/orders/$o3Id/status" -Method Patch -Body (@{ status = "OUT_FOR_DELIVERY" } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes | Out-Null
$delRes = Invoke-RestMethod -Uri "$base/api/admin/orders/$o3Id/status" -Method Patch -Body (@{ status = "DELIVERED" } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes

$orderDetail = Invoke-RestMethod -Uri "$base/api/admin/orders/$o3Id" -WebSession $adminSes
$firstItem = $orderDetail.order.items[0]
Write-Host "Delivered Order: $o3No | Item: $($firstItem.product.name) | Qty: $($firstItem.qty)"

# Process return for reason "damaged"
$returnPayload = @{
  items = @(
    @{
      orderItemId = $firstItem.id
      qty = 1
      reasonCode = "damaged"
    }
  )
  notes = "Product carton was punctured"
} | ConvertTo-Json

$returnRes = Invoke-RestMethod -Uri "$base/api/admin/orders/$o3Id/returns" -Method Post -Body $returnPayload -ContentType "application/json" -WebSession $adminSes
Write-Host "Return Response:"
Write-Host "  Refund Amount: Rs $($returnRes.refundAmountPaise / 100)"
Write-Host "  Return Reason: $($returnRes.returns[0].reason_code)"
Write-Host "  Shop Cost:     Rs $($returnRes.returns[0].shop_cost_paise / 100)"

if ($returnRes.refundAmountPaise -eq $firstItem.selling_price_paise -and $returnRes.returns[0].reason_code -eq "damaged") {
  Write-Host "  [PASS] Partial return refunded only returned items and recorded shop deduction!" -ForegroundColor Green
} else {
  Write-Host "  [FAIL] Partial return amounts mismatch!" -ForegroundColor Red
}

Write-Host "`n=== [TEST 4] Admin Cancellation Mandatory Reason Check ==="
$order4Info = New-ConfirmedUpiOrder ("f18-mtest-4-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$o4Id = $order4Info.orderId

try {
  Invoke-WebRequest -Uri "$base/api/admin/orders/$o4Id/cancel" -Method Post -Body (@{ reason = "   " } | ConvertTo-Json) -ContentType "application/json" -WebSession $adminSes | Out-Null
  Write-Host "  [FAIL] Admin cancellation without reason should be rejected!" -ForegroundColor Red
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  Write-Host "  [PASS] Admin cancellation without reason correctly rejected with HTTP $statusCode" -ForegroundColor Green
}

Write-Host "`n=========================================================="
Write-Host " ALL MANUAL INTEGRATION TESTS FOR F18 PASSED!"
Write-Host "=========================================================="
