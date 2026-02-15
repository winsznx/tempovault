# TempoVault Operations Runbook

This runbook provides operational procedures for running and maintaining TempoVault in production.

---

## Quick Reference

### Service Status
```bash
# Check all services
sudo systemctl status tempovault-api
sudo systemctl status tempovault-indexer
sudo systemctl status tempovault-oracle

# View logs
sudo journalctl -u tempovault-api -f
sudo journalctl -u tempovault-indexer -f
sudo journalctl -u tempovault-oracle -f
```

### Health Checks
```bash
# API Health
curl https://api.tempovault.xyz/health

# API Ready (checks RPC + DB)
curl https://api.tempovault.xyz/ready

# Database Connection
psql -U tempovault -d tempovault -c "SELECT COUNT(*) FROM deposits;"
```

---

## Common Operations

### 1. Reindexing Events

**When to reindex:**
- After database corruption
- To backfill historical data
- After schema changes

**Procedure:**

```bash
# 1. Stop indexer
sudo systemctl stop tempovault-indexer

# 2. Backup database
sudo -u postgres pg_dump tempovault > /backup/tempovault_$(date +%Y%m%d).sql

# 3. Clear event tables (CAREFUL!)
psql -U tempovault -d tempovault << EOF
TRUNCATE deposits, withdrawals, deployments, recalls, losses, rebalances, circuit_breakers;
EOF

# 4. Set start block in .env
nano /home/tempovault/tempovault/.env
# Update: START_BLOCK=12345678

# 5. Restart indexer
sudo systemctl start tempovault-indexer

# 6. Monitor progress
sudo journalctl -u tempovault-indexer -f
```

**Verification:**
```bash
# Check latest indexed block
psql -U tempovault -d tempovault -c \
  "SELECT MAX(block_number) FROM deposits;"
```

---

### 2. Oracle Recovery

**Symptoms:**
- Oracle health shows "stale" or "dead"
- Strategies not deploying
- Risk signals outdated

**Diagnosis:**
```bash
# Check oracle process
pgrep -f oracle_relay.py

# Check oracle logs
sudo journalctl -u tempovault-oracle -n 100

# Check last oracle update
curl https://api.tempovault.xyz/api/v1/risk/PAIR_ID/status?risk_controller_address=...
```

**Recovery:**

```bash
# 1. Stop oracle
sudo systemctl stop tempovault-oracle

# 2. Verify RPC connectivity
curl -X POST https://rpc.tempo.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# 3. Verify oracle private key (check .env)
# Never log or expose the key!

# 4. Restart oracle
sudo systemctl restart tempovault-oracle

# 5. Verify updates resuming
sudo journalctl -u tempovault-oracle -f
# Should see: "Oracle signal submitted successfully"
```

**If still failing:**
```bash
# Check oracle balance (needs gas)
cast balance $ORACLE_ADDRESS --rpc-url https://rpc.tempo.xyz

# Check nonce issues
cast nonce $ORACLE_ADDRESS --rpc-url https://rpc.tempo.xyz
```

---

### 3. Database Maintenance

#### Backup

**Daily automated backup:**
```bash
# Add to crontab
0 2 * * * sudo -u postgres pg_dump tempovault | gzip > /backup/tempovault_$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days
0 3 * * * find /backup -name "tempovault_*.sql.gz" -mtime +30 -delete
```

**Manual backup:**
```bash
sudo -u postgres pg_dump tempovault > tempovault_backup.sql
```

#### Restore

```bash
# 1. Stop all services
sudo systemctl stop tempovault-api tempovault-indexer tempovault-oracle

# 2. Drop and recreate database
sudo -u postgres dropdb tempovault
sudo -u postgres createdb tempovault

# 3. Restore from backup
psql -U tempovault -d tempovault < tempovault_backup.sql

# 4. Restart services
sudo systemctl start tempovault-api tempovault-indexer tempovault-oracle
```

#### Vacuum and Analyze

```bash
# Run weekly to optimize performance
psql -U tempovault -d tempovault -c "VACUUM ANALYZE;"
```

---

### 4. Rotating Oracle Private Key

**When to rotate:**
- Every 90 days (recommended)
- After suspected compromise
- Team member departure

**Procedure:**

```bash
# 1. Generate new private key
cast wallet new
# Save new private key and address securely

# 2. Fund new oracle address
cast send $NEW_ORACLE_ADDRESS \
  --value 0.1ether \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY

# 3. Grant oracle role to new address
cast send $RISK_CONTROLLER_ADDRESS \
  "setOracleAddress(address)" $NEW_ORACLE_ADDRESS \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY

# 4. Stop oracle service
sudo systemctl stop tempovault-oracle

# 5. Update .env with new key
sudo nano /home/tempovault/tempovault/.env
# Update: ORACLE_PRIVATE_KEY=0x...

# 6. Restart oracle
sudo systemctl start tempovault-oracle

# 7. Verify new oracle working
sudo journalctl -u tempovault-oracle -f

# 8. After 24h, revoke old oracle address (optional)
cast send $GOVERNANCE_ROLES_ADDRESS \
  "revokeRole(bytes32,address)" \
  $ORACLE_ROLE $OLD_ORACLE_ADDRESS \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY
```

---

### 5. Scaling Services

#### Vertical Scaling (More Resources)

```bash
# Upgrade DigitalOcean droplet
# 1. Create snapshot
# 2. Resize droplet in control panel
# 3. Verify services after resize
sudo systemctl status tempovault-*
```

#### Horizontal Scaling (More Instances)

**API Server (stateless, easy to scale):**

```nginx
# Load balancer config
upstream api_backend {
    least_conn;
    server 10.0.1.1:3000 weight=1;
    server 10.0.1.2:3000 weight=1;
    server 10.0.1.3:3000 weight=1;
}

server {
    location / {
        proxy_pass http://api_backend;
    }
}
```

**Event Indexer (single instance only):**
- Only run ONE indexer instance
- Use idempotency to prevent duplicates
- Use database locks if needed

**Oracle Relay (single instance recommended):**
- Only run ONE oracle instance
- Multiple oracles will cause nonce conflicts

---

### 6. Circuit Breaker Management

**Check circuit breaker status:**
```bash
cast call $RISK_CONTROLLER_ADDRESS \
  "circuitBroken(bytes32)" $PAIR_ID \
  --rpc-url https://rpc.tempo.xyz
```

**Manually trigger circuit breaker (ADMIN_ROLE):**
```bash
cast send $RISK_CONTROLLER_ADDRESS \
  "setCircuitBreaker(bytes32,bool)" $PAIR_ID true \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY
```

**Reset circuit breaker:**
```bash
cast send $RISK_CONTROLLER_ADDRESS \
  "setCircuitBreaker(bytes32,bool)" $PAIR_ID false \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY
```

---

### 7. Emergency Procedures

#### Complete System Shutdown

```bash
# 1. Pause all strategies (ADMIN_ROLE)
cast send $TREASURY_VAULT_ADDRESS "pause()" \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $ADMIN_PRIVATE_KEY

# 2. Stop all offchain services
sudo systemctl stop tempovault-api
sudo systemctl stop tempovault-indexer
sudo systemctl stop tempovault-oracle

# 3. Prevent access (if needed)
sudo systemctl stop nginx

# 4. Verify all stopped
ps aux | grep -E "api_server|indexer|oracle"
```

#### Emergency Capital Withdrawal

**If strategy is compromised:**

```bash
# 1. Emergency unwind (EMERGENCY_ROLE required)
cast send $DEX_STRATEGY_ADDRESS \
  "emergencyUnwind(bytes32)" $PAIR_ID \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $EMERGENCY_PRIVATE_KEY

# 2. Withdraw from vault (TREASURY_MANAGER)
cast send $TREASURY_VAULT_ADDRESS \
  "withdraw(address,uint256,address)" \
  $TOKEN $AMOUNT $RECIPIENT \
  --rpc-url https://rpc.tempo.xyz \
  --private-key $TREASURY_MANAGER_KEY

# 3. Verify funds moved
cast call $TOKEN "balanceOf(address)" $RECIPIENT \
  --rpc-url https://rpc.tempo.xyz
```

---

### 8. Monitoring Alerts

**Critical Alerts (immediate action required):**
- API /health returns unhealthy
- Oracle hasn't updated in 5+ minutes
- Event indexer stopped progressing
- Circuit breaker triggered
- Database connection failures

**Warning Alerts (investigate within 1 hour):**
- Oracle showing "stale" status
- API response time > 2s
- Disk usage > 80%
- Memory usage > 85%
- Event indexer lag > 100 blocks

**Setup monitoring:**
```bash
# Example: Grafana + Prometheus
# Scrape /metrics endpoint from API
# Alert on key metrics
```

---

### 9. Log Analysis

**Find errors:**
```bash
# API errors
sudo journalctl -u tempovault-api --since "1 hour ago" | grep -i error

# Indexer errors
sudo journalctl -u tempovault-indexer --since "1 hour ago" | grep -i error

# Oracle errors
sudo journalctl -u tempovault-oracle --since "1 hour ago" | grep -i error
```

**Track specific transaction:**
```bash
# Find deposit event
psql -U tempovault -d tempovault -c \
  "SELECT * FROM deposits WHERE tx_hash = '0x...';"
```

**Performance analysis:**
```bash
# Slow queries (PostgreSQL)
psql -U tempovault -d tempovault -c \
  "SELECT query, mean_exec_time FROM pg_stat_statements
   ORDER BY mean_exec_time DESC LIMIT 10;"
```

---

### 10. Troubleshooting Guide

#### Problem: API returns 503 Service Unavailable

**Diagnosis:**
```bash
# Check API process
pgrep -f api_server.py

# Check RPC connection
curl -X POST https://rpc.tempo.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'

# Check database connection
psql -U tempovault -d tempovault -c "SELECT 1;"
```

**Solution:**
```bash
sudo systemctl restart tempovault-api
```

#### Problem: Frontend shows "Failed to fetch orders"

**Diagnosis:**
```bash
# Test API endpoint directly
curl https://api.tempovault.xyz/api/v1/strategy/$STRATEGY/orders/$PAIR_ID

# Check CORS headers
curl -I https://api.tempovault.xyz/api/v1/stats
```

**Solution:**
- Verify API is running
- Check ALLOWED_ORIGINS in .env
- Restart API if needed

#### Problem: Transactions failing with "insufficient funds"

**Check balances:**
```bash
# Oracle balance (needs gas)
cast balance $ORACLE_ADDRESS --rpc-url https://rpc.tempo.xyz

# User balance
cast balance $USER_ADDRESS --rpc-url https://rpc.tempo.xyz
```

**Solution:**
- Fund oracle address if below 0.01 ETH
- User needs to fund wallet

#### Problem: Event indexer not progressing

**Diagnosis:**
```bash
# Check latest block
psql -U tempovault -d tempovault -c \
  "SELECT MAX(block_number) FROM deposits;"

# Check current chain height
cast block-number --rpc-url https://rpc.tempo.xyz

# Check for errors
sudo journalctl -u tempovault-indexer -n 50
```

**Solution:**
```bash
# Usually just needs restart
sudo systemctl restart tempovault-indexer

# If corrupted, see "Reindexing Events" section
```

---

## Performance Tuning

### PostgreSQL Optimization

```sql
-- Recommended settings for 16GB RAM server
-- /etc/postgresql/14/main/postgresql.conf

shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10485kB
min_wal_size = 1GB
max_wal_size = 4GB
```

### API Server Optimization

```python
# Increase worker processes
# gunicorn config
workers = (CPU_COUNT * 2) + 1
threads = 4
worker_class = 'uvicorn.workers.UvicornWorker'
```

---

## Security Checklist

**Monthly:**
- [ ] Review access logs for anomalies
- [ ] Check for outdated dependencies
- [ ] Verify backup integrity
- [ ] Review role assignments

**Quarterly:**
- [ ] Rotate oracle private key
- [ ] Update SSL certificates (auto with certbot)
- [ ] Security audit of smart contracts
- [ ] Penetration testing

**Annually:**
- [ ] Full disaster recovery test
- [ ] Infrastructure security review
- [ ] Update incident response procedures

---

## Contact Information

**Escalation Path:**
1. **Level 1**: DevOps on-call (check logs, restart services)
2. **Level 2**: Backend engineer (database, API issues)
3. **Level 3**: Smart contract developer (onchain issues)

**Emergency Contacts:**
- DevOps: +1-XXX-XXX-XXXX
- Backend: +1-XXX-XXX-XXXX
- Security: security@tempovault.xyz

---

**Last Updated**: 2026-02-15
**Next Review**: 2026-05-15
