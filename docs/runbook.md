# PlukIt Emergency Operational Runbook (F21)

This runbook outlines mandatory operational protocols, incident response procedures, emergency kill-switches, and escalation paths for the PlukIt hyper-local delivery platform.

---

## 1. Incident Severity Classifications

| Severity | Definition | Examples | SLA / Response Time |
| :--- | :--- | :--- | :--- |
| **P1 - Critical** | Catastrophic failure affecting checkout, data loss, security compromise, or complete payment gateway failure. | Razorpay 5xx outage, database corruption, cart unresponsive. | **< 15 minutes** (24/7) |
| **P2 - Degraded** | Partial degradation of auxiliary systems; core checkout functions remain operational. | SMS OTP delayed, single shop products failing CSV import, PDF invoice generation delay. | **< 1 hour** (8 AM - 11 PM) |
| **P3 - Minor** | Minor operational anomaly or customer ticket not blocking current orders. | Minor UI visual defect, customer address amendment, return request review. | **< 4 hours** (Business hours) |

---

## 2. Procedure 1: Payment Kill-Switch Protocol

### Trigger Criteria
- Razorpay payment failure rate exceeds 5% over a 10-minute window.
- Scheduled bank downtime affecting major UPI handles (HDFC, SBI, ICICI, Axis).
- Downstream webhook delivery outage causing orders to stall in `PAYMENT_PENDING`.

### Action Options

#### Option A: 1-Click Admin GUI (Fastest)
1. Open browser to `https://plukit.in/admin/settings` (or `http://localhost:3000/admin/settings` in development).
2. Authenticate with admin credentials.
3. In the **Payment Gateway Kill-Switch** card:
   - Provide audit note in the reason box (e.g. *"Razorpay UPI outage reported on status page"*).
   - Click **🛑 Engage Kill-Switch (Disable UPI)**.
   - Confirm browser dialog.
4. The system immediately sets `ONLINE_PAYMENTS_ENABLED = 0` in database, invalidates caching, and logs an entry to `audit_logs`.

#### Option B: REST API Invocation
```bash
curl -X PATCH https://plukit.in/api/admin/settings/payments \
  -H "Content-Type: application/json" \
  -H "Cookie: plukit_admin_token=<ADMIN_TOKEN>" \
  -d '{"enabled": false, "reason": "Emergency UPI pause via CLI"}'
```

#### Option C: Environment Variable Fallback
Set in `server/.env`:
```env
DISABLE_ONLINE_PAYMENTS=true
```
Then reload PM2:
```bash
pm2 reload plukit-server
```

### Verification Steps
1. Query public settings endpoint:
   ```bash
   curl -s https://plukit.in/api/settings/public
   ```
   **Expected Response:** `{"serviceablePincode":"411001","codMaxLimitPaise":100000,"onlinePaymentsEnabled":false}`
2. Open checkout page (`/checkout`):
   - UPI card is disabled with badge: `Paused (Maintenance)`.
   - Payment method defaults to `COD`.
   - Attempting to submit a UPI order returns HTTP 400 with `code: ONLINE_PAYMENTS_DISABLED`.

### Recovery & De-escalation
1. Confirm Razorpay services are restored at [status.razorpay.com](https://status.razorpay.com).
2. On `https://plukit.in/admin/settings`, click **✅ Resume Online Payments (Enable UPI)**.
3. Verify public settings returns `"onlinePaymentsEnabled": true`.

---

## 3. Procedure 2: Database Restoration Protocol

### Target Objectives
- **RTO (Recovery Time Objective):** < 30 minutes.
- **RPO (Recovery Point Objective):** < 24 hours (nightly automated backup at 03:00 AM IST).

### Step-by-Step Execution

#### Step 1: Halt Incoming Traffic
```bash
# Prevent dirty writes during restoration
pm2 stop plukit-server
```

#### Step 2: Locate Most Recent Valid Backup
```bash
# List available backups sorted by date
ls -lht backups/db_backup_*.sql
# Or on Windows PowerShell:
# Get-ChildItem backups\db_backup_*.sql | Sort-Object LastWriteTime -Descending
```

#### Step 3: Run Restore Script

**On Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore_db.ps1 -BackupFile "backups\db_backup_YYYYMMDD_HHMMSS.sql" -Force
```

**On Linux / Production Host:**
```bash
./scripts/restore_db.sh /var/backups/plukit/db_backup_YYYYMMDD_HHMMSS.sql --force
```

#### Step 4: Validate Restored Database
Verify key tables and records:
```bash
node -e "const { execSync } = require('child_process'); console.log(execSync('psql \"' + process.env.DATABASE_URL + '\" -c \"SELECT count(*) FROM products; SELECT count(*) FROM users; SELECT count(*) FROM orders;\"', { encoding: 'utf8' }));"
```

#### Step 5: Restart Application & Verify Health
```bash
pm2 start plukit-server
curl -I https://plukit.in/api/settings/public
```

---

## 4. Procedure 3: Customer Incident Notification Protocol

When an incident causes order delays or payment disruption, proactive customer communication must be dispatched within 10 minutes.

### Template 1: Payment Outage Notice (SMS / WhatsApp)
> **Channel:** SMS / WhatsApp via Msg91  
> **Audience:** All active users or banner on homepage  
> **Text:**  
> *"Namaste! PlukIt online payment services are temporarily paused for scheduled maintenance. You can continue placing orders seamlessly using Cash on Delivery (COD) for orders up to ₹1,000. We apologize for the inconvenience."*

### Template 2: Order Delivery Delay Notice
> **Channel:** SMS / WhatsApp  
> **Audience:** Customers with orders in `ACCEPTED` or `DISPATCHED` state  
> **Text:**  
> *"Dear {CustomerName}, your PlukIt order #{OrderNo} from {ShopName} is slightly delayed due to peak neighborhood delivery volume. Our delivery champion is en route and will arrive shortly. Live support: support@plukit.in"*

### Template 3: Incident Resolved Notice
> **Channel:** SMS / WhatsApp / App Banner  
> **Text:**  
> *"All payment and delivery systems on PlukIt are now fully operational. Thank you for your patience and for shopping local with PlukIt Pune!"*

---

## 5. Escalation Contact Directory

| Role | Contact Name | Emergency Phone | Email | Availability |
| :--- | :--- | :--- | :--- | :--- |
| **Founder & Incident Commander** | Dhiraj | +91 98000 00001 | dhiraj@plukit.in | 24/7 On-Call |
| **Grievance Officer (Legal Compliance)** | Grievance Desk | +91 98000 00002 | grievance@plukit.in | Mon-Sat 9am-6pm IST |
| **Lead DBA & Infrastructure** | Operations Team | +91 98000 00003 | ops@plukit.in | 24/7 On-Call |
| **Razorpay NOC / Escalation** | Merchant Support | 1800 123 7729 | support@razorpay.com | 24/7 Gateway Desk |
| **Msg91 Enterprise Support** | Support Desk | — | support@msg91.com | 24/7 Support Desk |
| **Pune Camp Partner Coordinator** | Field Coordinator | +91 98000 00004 | field@plukit.in | 7am - 10pm IST |
