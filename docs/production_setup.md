# PlukIt Production Deployment Guide (F21)

This guide documents the complete procedure for deploying PlukIt to an Ubuntu 22.04 LTS / Debian 12 production host.

---

## 1. System Architecture

```text
       [ Internet / Client Devices ]
                    │
                    ▼ (Port 80/443 HTTPS)
            ┌───────────────┐
            │  Nginx 1.24+  │ (SSL Termination, Rate Limiting, HTTP/2, Static Caching)
            └───────┬───────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
┌──────────────┐         ┌──────────────┐
│ Next.js Web  │         │ Express API  │
│ Port 3000    │         │ Port 4000    │
│ PM2 Cluster  │         │ PM2 Cluster  │
└──────────────┘         └───────┬──────┘
                                 │
                                 ▼
                     ┌──────────────────────┐
                     │ PostgreSQL 16+ Local │
                     │ port 5432            │
                     └──────────────────────┘
```

---

## 2. Server Prerequisites & Package Installation

```bash
# 1. Update OS packages
sudo apt update && sudo apt upgrade -y

# 2. Install essential utilities
sudo apt install -y curl wget git build-essential ufw certbot python3-certbot-nginx

# 3. Install Node.js 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2

# 4. Install PostgreSQL 16+
sudo apt install -y postgresql postgresql-contrib

# 5. Install Nginx
sudo apt install -y nginx
```

---

## 3. Database Configuration

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE delivery_app;
CREATE USER plukit_prod WITH ENCRYPTED PASSWORD 'YOUR_STRONG_PROD_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE delivery_app TO plukit_prod;
ALTER DATABASE delivery_app OWNER TO plukit_prod;
\q
```

---

## 4. Application Setup & Build

```bash
# Clone repository
sudo mkdir -p /var/www/plukit
sudo chown -R $USER:$USER /var/www/plukit
git clone <REPO_URL> /var/www/plukit
cd /var/www/plukit

# 1. Server Setup
cd server
npm ci --production=false
cp .env.example .env
# Edit server/.env with production credentials:
# DATABASE_URL="postgresql://plukit_prod:YOUR_STRONG_PROD_PASSWORD@localhost:5432/delivery_app?schema=public"
# RAZORPAY_KEY_ID="rzp_live_..."
# RAZORPAY_KEY_SECRET="..."
# MSG91_AUTH_KEY="..."
# JWT_SECRET="..."
# COOKIE_SECRET="..."

npx prisma migrate deploy
npm run prisma:seed
npm run build

# 2. Client Setup
cd ../client
npm ci --production=false
# Create client/.env.production:
# NEXT_PUBLIC_API_URL="https://plukit.in/api"
npm run build
```

---

## 5. PM2 Cluster Daemonization

```bash
cd /var/www/plukit
mkdir -p logs

# Start applications using production ecosystem
pm2 start deployment/ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 systemd daemon to auto-start on server reboot
pm2 startup systemd
# (Run the generated sudo env command printed by PM2)
```

Useful PM2 commands:
- `pm2 status`: View running cluster workers.
- `pm2 logs`: View combined logs.
- `pm2 reload deployment/ecosystem.config.cjs`: Zero-downtime rolling restart.

---

## 6. SSL & Nginx Configuration

```bash
# 1. Obtain Let's Encrypt SSL Certificate
sudo certbot certonly --standalone -d plukit.in -d www.plukit.in --non-interactive --agree-tos -m admin@plukit.in

# 2. Copy Nginx Configuration
sudo cp /var/www/plukit/deployment/nginx.conf /etc/nginx/nginx.conf

# 3. Test and reload Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 7. Automated Daily Backups (Cron)

Set up automated daily backups with rolling 14-day retention:

```bash
# Open crontab
crontab -e

# Add daily backup at 03:00 AM IST (21:30 UTC):
30 21 * * * /var/www/plukit/scripts/backup_db.sh /var/backups/plukit 14 >> /var/log/plukit_backup.log 2>&1
```

---

## 8. Firewall (UFW) Configuration

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 9. Verification & Health Monitoring

- Public API Health: `curl -I https://plukit.in/api/settings/public`
- Public Homepage: `curl -I https://plukit.in`
- Admin Settings: `https://plukit.in/admin/settings`
