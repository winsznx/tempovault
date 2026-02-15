# TempoVault Production Deployment Guide

This guide covers deploying TempoVault to production environments.

---

## Prerequisites

- [ ] Tempo Mainnet RPC access (Chain ID: 4217)
- [ ] Production PostgreSQL database
- [ ] Domain name configured with SSL
- [ ] Privy production app credentials
- [ ] Server infrastructure (DigitalOcean/AWS/GCP)
- [ ] Private keys for deployer and oracle (securely stored)

---

## 1. Smart Contract Deployment

### Deploy to Tempo Mainnet

```bash
# Set environment
export RPC_URL=https://rpc.tempo.xyz
export CHAIN_ID=4217
export DEPLOYER_PRIVATE_KEY=0x...  # Secure!
export ETHERSCAN_API_KEY=your_tempo_explorer_key

# Deploy contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify \
  --slow

# Save deployed addresses
# Update .env.production with contract addresses
```

### Post-Deployment Contract Setup

```bash
# 1. Grant roles (use deployed GovernanceRoles address)
cast send $GOVERNANCE_ROLES_ADDRESS "grantRole(bytes32,address)" \
  $ADMIN_ROLE $ADMIN_ADDRESS \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# 2. Configure RiskController
cast send $RISK_CONTROLLER_ADDRESS "setOracleAddress(address)" \
  $ORACLE_ADDRESS \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# 3. Approve tokens in TreasuryVault
cast send $TREASURY_VAULT_ADDRESS "approveToken(address)" \
  $PATHUSD_ADDRESS \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_PRIVATE_KEY
```

---

## 2. Backend Deployment (DigitalOcean)

### Server Setup

```bash
# Create Droplet (Ubuntu 22.04 LTS, 4GB RAM minimum)
# SSH into server

# Install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3-pip postgresql-14 nginx certbot

# Create service user
sudo useradd -m -s /bin/bash tempovault
sudo su - tempovault
```

### PostgreSQL Setup

```bash
# Create database
sudo -u postgres createuser tempovault
sudo -u postgres createdb tempovault
sudo -u postgres psql -c "ALTER USER tempovault WITH PASSWORD 'SECURE_PASSWORD';"

# Load schema
psql -U tempovault -d tempovault < /path/to/indexer_schema.sql

# Configure pg_hba.conf for production
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: host tempovault tempovault 127.0.0.1/32 md5
sudo systemctl restart postgresql
```

### Deploy Offchain Services

```bash
# Clone repository
git clone https://github.com/your-org/tempovault.git
cd tempovault

# Install Python dependencies
pip3 install -r offchain/requirements.txt

# Configure environment
cp .env.example .env.production
nano .env.production  # Set all production values

# Create systemd services
sudo cp deployment/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload

# Start services
sudo systemctl enable tempovault-api
sudo systemctl enable tempovault-indexer
sudo systemctl enable tempovault-oracle
sudo systemctl start tempovault-api
sudo systemctl start tempovault-indexer
sudo systemctl start tempovault-oracle

# Verify status
sudo systemctl status tempovault-*
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/tempovault-api
server {
    listen 80;
    server_name api.tempovault.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Enable site and SSL
sudo ln -s /etc/nginx/sites-available/tempovault-api /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.tempovault.xyz
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Frontend Deployment (Vercel)

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from dashboard directory
cd dashboard
vercel --prod

# Configure environment variables in Vercel dashboard
# Settings → Environment Variables:
# - VITE_API_URL=https://api.tempovault.xyz
# - VITE_PRIVY_APP_ID=...
# - VITE_GOVERNANCE_ROLES_ADDRESS=...
# - (all other VITE_* variables)
```

### Custom Domain Configuration

```bash
# In Vercel dashboard:
# 1. Domains → Add Domain → tempovault.xyz
# 2. Configure DNS:
#    - Type: CNAME
#    - Name: @
#    - Value: cname.vercel-dns.com

# Wait for DNS propagation (check with)
dig tempovault.xyz
```

---

## 4. Environment Configuration

### Production .env Template

```bash
# Blockchain (Tempo Mainnet)
RPC_URL=https://rpc.tempo.xyz
CHAIN_ID=4217
EXPLORER_URL=https://explore.tempo.xyz

# Deployed Contract Addresses
GOVERNANCE_ROLES_ADDRESS=0x...
TREASURY_VAULT_ADDRESS=0x...
DEX_STRATEGY_ADDRESS=0x...
RISK_CONTROLLER_ADDRESS=0x...

# Oracle (SECURE!)
ORACLE_PRIVATE_KEY=0x...
ORACLE_UPDATE_INTERVAL=60

# Database (Production)
INDEXER_DB_URL=postgresql://tempovault:SECURE_PASSWORD@localhost:5432/tempovault

# API Server
API_PORT=3000
API_HOST=0.0.0.0
ALLOWED_ORIGINS=https://tempovault.xyz,https://www.tempovault.xyz

# Privy (Production Credentials)
PRIVY_APP_ID=prod_privy_app_id
PRIVY_APP_SECRET=prod_privy_secret

# Event Indexer
START_BLOCK=0
POLL_INTERVAL=5
```

---

## 5. Monitoring Setup

### Application Monitoring

```bash
# Install monitoring tools
pip3 install prometheus-client sentry-sdk

# Configure Sentry
export SENTRY_DSN=https://...@sentry.io/...
```

### System Monitoring

```bash
# Install monitoring stack
sudo apt install -y prometheus grafana

# Configure Prometheus
# /etc/prometheus/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'tempovault-api'
    static_configs:
      - targets: ['localhost:3000']

# Start services
sudo systemctl enable prometheus grafana-server
sudo systemctl start prometheus grafana-server
```

### Log Monitoring

```bash
# Centralized logging
sudo journalctl -u tempovault-api -f
sudo journalctl -u tempovault-indexer -f
sudo journalctl -u tempovault-oracle -f
```

---

## 6. Security Checklist

### Pre-Deployment

- [ ] All private keys stored in secure password manager
- [ ] Environment variables set (no .env committed to git)
- [ ] SSL certificates configured
- [ ] Firewall configured (UFW/iptables)
- [ ] SSH key-based authentication only
- [ ] Fail2ban installed and configured
- [ ] PostgreSQL password is strong and unique
- [ ] Privy production app configured
- [ ] Rate limiting enabled on API
- [ ] CORS configured with specific origins

### Post-Deployment

- [ ] Smart contracts verified on Tempo Explorer
- [ ] Health checks passing (/health, /ready)
- [ ] Event indexer progressing
- [ ] Oracle updating successfully
- [ ] Frontend accessible and loads correctly
- [ ] Test all user flows (deposit, withdraw, deploy)
- [ ] Monitor logs for errors
- [ ] Set up alerts for critical failures
- [ ] Document all deployed addresses
- [ ] Backup private keys securely

---

## 7. Post-Deployment Testing

```bash
# Test API health
curl https://api.tempovault.xyz/health
curl https://api.tempovault.xyz/ready

# Test contract interaction
cast call $TREASURY_VAULT_ADDRESS "balanceOf(address)" $USER_ADDRESS \
  --rpc-url https://rpc.tempo.xyz

# Test frontend
# 1. Visit https://tempovault.xyz
# 2. Complete authentication flow
# 3. Verify dashboard loads
# 4. Test deposit/withdraw (small amounts)
```

---

## 8. Rollback Procedure

If deployment fails:

```bash
# 1. Revert DNS to previous configuration
# 2. Rollback Vercel deployment
vercel rollback

# 3. Stop new services
sudo systemctl stop tempovault-*

# 4. Restore previous version
git checkout previous-version
sudo systemctl start tempovault-*

# 5. Verify previous version working
curl https://api.tempovault.xyz/health
```

---

## 9. Scaling Considerations

### Horizontal Scaling

```bash
# Load balancer configuration (Nginx)
upstream api_backend {
    server 10.0.1.1:3000;
    server 10.0.1.2:3000;
    server 10.0.1.3:3000;
}

# Database read replicas
# Configure PostgreSQL streaming replication
```

### Vertical Scaling

- API Server: 2-4 CPU cores, 4-8GB RAM
- Event Indexer: 2 CPU cores, 4GB RAM
- Oracle Relay: 1 CPU core, 2GB RAM
- PostgreSQL: 4-8 CPU cores, 16-32GB RAM (for high volume)

---

## Support

For deployment issues:
- Check logs: `sudo journalctl -u tempovault-*`
- Review health endpoints
- Consult RUNBOOK.md for troubleshooting

---

**Last Updated**: 2026-02-15
