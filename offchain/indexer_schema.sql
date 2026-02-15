-- TempoVault Event Indexer Schema
-- PostgreSQL 14+

CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INTEGER NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    event_data JSONB NOT NULL,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(transaction_hash, log_index)
);

CREATE INDEX idx_events_block_number ON events(block_number);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_contract_address ON events(contract_address);
CREATE INDEX idx_events_timestamp ON events(block_timestamp);
CREATE INDEX idx_events_data_vault_id ON events((event_data->>'vaultId'));
CREATE INDEX idx_events_data_pair_id ON events((event_data->>'pairId'));

CREATE TABLE IF NOT EXISTS deposits (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    token VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    depositor VARCHAR(42) NOT NULL,
    new_balance NUMERIC(78, 0) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_deposits_vault_id ON deposits(vault_id);
CREATE INDEX idx_deposits_token ON deposits(token);

CREATE TABLE IF NOT EXISTS withdrawals (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    token VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    recipient VARCHAR(42) NOT NULL,
    new_balance NUMERIC(78, 0) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_withdrawals_vault_id ON withdrawals(vault_id);
CREATE INDEX idx_withdrawals_token ON withdrawals(token);

CREATE TABLE IF NOT EXISTS deployments (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    deployment_id BIGINT NOT NULL,
    strategy VARCHAR(42) NOT NULL,
    token VARCHAR(42) NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    pair_id VARCHAR(66) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_deployments_vault_id ON deployments(vault_id);
CREATE INDEX idx_deployments_deployment_id ON deployments(deployment_id);
CREATE INDEX idx_deployments_pair_id ON deployments(pair_id);

CREATE TABLE IF NOT EXISTS recalls (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    deployment_id BIGINT NOT NULL,
    returned_amount NUMERIC(78, 0) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_recalls_vault_id ON recalls(vault_id);
CREATE INDEX idx_recalls_deployment_id ON recalls(deployment_id);

CREATE TABLE IF NOT EXISTS losses (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    deployment_id BIGINT NOT NULL,
    token VARCHAR(42) NOT NULL,
    deployed_amount NUMERIC(78, 0) NOT NULL,
    returned_amount NUMERIC(78, 0) NOT NULL,
    loss NUMERIC(78, 0) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_losses_vault_id ON losses(vault_id);
CREATE INDEX idx_losses_token ON losses(token);

CREATE TABLE IF NOT EXISTS performance_fees (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    token VARCHAR(42) NOT NULL,
    yield_amount NUMERIC(78, 0) NOT NULL,
    fee_amount NUMERIC(78, 0) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_performance_fees_vault_id ON performance_fees(vault_id);

CREATE TABLE IF NOT EXISTS management_fees (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    vault_id BIGINT NOT NULL,
    token VARCHAR(42) NOT NULL,
    fee_amount NUMERIC(78, 0) NOT NULL,
    period_seconds BIGINT NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_management_fees_vault_id ON management_fees(vault_id);

CREATE TABLE IF NOT EXISTS oracle_updates (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    pair_id VARCHAR(66) NOT NULL,
    peg_deviation INTEGER NOT NULL,
    orderbook_depth_bid NUMERIC(78, 0) NOT NULL,
    orderbook_depth_ask NUMERIC(78, 0) NOT NULL,
    nonce BIGINT NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_oracle_updates_pair_id ON oracle_updates(pair_id);
CREATE INDEX idx_oracle_updates_nonce ON oracle_updates(nonce);

CREATE TABLE IF NOT EXISTS circuit_breakers (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    pair_id VARCHAR(66) NOT NULL,
    triggered BOOLEAN NOT NULL,
    triggered_by VARCHAR(42) NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_circuit_breakers_pair_id ON circuit_breakers(pair_id);

CREATE TABLE IF NOT EXISTS orders_placed (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT REFERENCES events(id),
    pair_id VARCHAR(66) NOT NULL,
    order_id BIGINT NOT NULL,
    tick INTEGER NOT NULL,
    amount NUMERIC(78, 0) NOT NULL,
    is_bid BOOLEAN NOT NULL,
    is_flip BOOLEAN NOT NULL,
    block_timestamp TIMESTAMP NOT NULL
);

CREATE INDEX idx_orders_placed_pair_id ON orders_placed(pair_id);
CREATE INDEX idx_orders_placed_order_id ON orders_placed(order_id);

CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_indexed_block BIGINT NOT NULL DEFAULT 0,
    last_indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO indexer_state (id, last_indexed_block) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE VIEW vault_summary AS
SELECT
    d.vault_id,
    d.token,
    COALESCE(SUM(d.amount), 0) as total_deposited,
    COALESCE(SUM(w.amount), 0) as total_withdrawn,
    COALESCE(SUM(dep.amount), 0) as total_deployed,
    COALESCE(SUM(l.loss), 0) as total_losses,
    COALESCE(SUM(pf.fee_amount), 0) as total_performance_fees,
    COALESCE(SUM(mf.fee_amount), 0) as total_management_fees
FROM
    (SELECT DISTINCT vault_id, token FROM deposits) AS vaults
LEFT JOIN deposits d USING (vault_id, token)
LEFT JOIN withdrawals w USING (vault_id, token)
LEFT JOIN deployments dep USING (vault_id, token)
LEFT JOIN losses l USING (vault_id, token)
LEFT JOIN performance_fees pf USING (vault_id, token)
LEFT JOIN management_fees mf USING (vault_id, token)
GROUP BY vaults.vault_id, vaults.token;
