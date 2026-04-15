CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code VARCHAR(32) NOT NULL UNIQUE,
  tenant_name VARCHAR(128) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE queues (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  queue_name VARCHAR(64) NOT NULL,
  queue_exten VARCHAR(16) NOT NULL,
  queue_display_name VARCHAR(128) NOT NULL,
  strategy VARCHAR(32) NOT NULL DEFAULT 'leastrecent',
  ring_timeout_seconds INTEGER NOT NULL DEFAULT 15,
  retry_seconds INTEGER NOT NULL DEFAULT 3,
  wrapup_seconds INTEGER NOT NULL DEFAULT 30,
  max_wait_seconds INTEGER NOT NULL DEFAULT 45,
  autopause BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, queue_name),
  UNIQUE (tenant_id, queue_exten)
);

CREATE TABLE agents (
  agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  login_id VARCHAR(64) NOT NULL,
  login_password_hash VARCHAR(255) NOT NULL,
  agent_code VARCHAR(32) NOT NULL,
  agent_name VARCHAR(128) NOT NULL,
  extension VARCHAR(16) NOT NULL,
  sip_endpoint VARCHAR(64),
  role VARCHAR(32) NOT NULL DEFAULT 'agent',
  employment_status VARCHAR(16) NOT NULL DEFAULT 'active',
  default_queue_id UUID NULL REFERENCES queues(queue_id),
  last_login_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, login_id),
  UNIQUE (tenant_id, agent_code),
  UNIQUE (tenant_id, extension)
);

CREATE TABLE queue_agent_members (
  queue_member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  queue_id UUID NOT NULL REFERENCES queues(queue_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  penalty INTEGER NOT NULL DEFAULT 0,
  member_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (queue_id, agent_id)
);

CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  customer_code VARCHAR(32),
  customer_name VARCHAR(128),
  company_name VARCHAR(128),
  grade VARCHAR(32),
  status VARCHAR(32) DEFAULT 'active',
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_phones (
  customer_phone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
  phone_number VARCHAR(32) NOT NULL,
  normalized_phone VARCHAR(32) NOT NULL,
  phone_type VARCHAR(16) NOT NULL DEFAULT 'mobile',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_phones_normalized_phone ON customer_phones(normalized_phone);

CREATE TABLE agent_status_history (
  status_history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  agent_id UUID NOT NULL REFERENCES agents(agent_id),
  status_code VARCHAR(32) NOT NULL,
  reason_code VARCHAR(32),
  reason_text VARCHAR(255),
  source_type VARCHAR(16) NOT NULL DEFAULT 'system',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE call_sessions (
  call_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  linkedid VARCHAR(32) NOT NULL,
  direction VARCHAR(16) NOT NULL,
  ani VARCHAR(32),
  ani_normalized VARCHAR(32),
  dnis VARCHAR(32),
  did_number VARCHAR(32),
  trunk_name VARCHAR(64),
  queue_id UUID NULL REFERENCES queues(queue_id),
  queue_name VARCHAR(64),
  customer_id UUID NULL REFERENCES customers(customer_id),
  primary_agent_id UUID NULL REFERENCES agents(agent_id),
  session_status VARCHAR(32) NOT NULL,
  campaign_code VARCHAR(64),
  result_code VARCHAR(32),
  result_detail VARCHAR(255),
  abandon_flag BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_flag BOOLEAN NOT NULL DEFAULT FALSE,
  callback_flag BOOLEAN NOT NULL DEFAULT FALSE,
  recording_flag BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL,
  queued_at TIMESTAMPTZ NULL,
  ringing_at TIMESTAMPTZ NULL,
  answered_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  wait_seconds INTEGER NOT NULL DEFAULT 0,
  ring_seconds INTEGER NOT NULL DEFAULT 0,
  talk_seconds INTEGER NOT NULL DEFAULT 0,
  hold_seconds INTEGER NOT NULL DEFAULT 0,
  acw_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, linkedid)
);
CREATE INDEX idx_call_sessions_started_at ON call_sessions(started_at DESC);
CREATE INDEX idx_call_sessions_primary_agent_started_at ON call_sessions(primary_agent_id, started_at DESC);

CREATE TABLE call_legs (
  leg_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES call_sessions(call_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  linkedid VARCHAR(32) NOT NULL,
  uniqueid VARCHAR(32) NOT NULL,
  parent_uniqueid VARCHAR(32),
  leg_type VARCHAR(16) NOT NULL,
  channel_name VARCHAR(128),
  bridged_channel_name VARCHAR(128),
  endpoint VARCHAR(64),
  agent_id UUID NULL REFERENCES agents(agent_id),
  state_code VARCHAR(32),
  dial_status VARCHAR(32),
  started_at TIMESTAMPTZ NOT NULL,
  bridged_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  disposition VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, uniqueid)
);
CREATE INDEX idx_call_legs_linkedid ON call_legs(linkedid);
CREATE INDEX idx_call_legs_agent_started_at ON call_legs(agent_id, started_at DESC);

CREATE TABLE queue_events (
  queue_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NULL REFERENCES call_sessions(call_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  linkedid VARCHAR(32) NOT NULL,
  queue_id UUID NULL REFERENCES queues(queue_id),
  queue_name VARCHAR(64) NOT NULL,
  agent_id UUID NULL REFERENCES agents(agent_id),
  event_type VARCHAR(32) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  wait_seconds INTEGER NOT NULL DEFAULT 0,
  ring_seconds INTEGER NOT NULL DEFAULT 0,
  position_no INTEGER,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_queue_events_queue_event_time ON queue_events(queue_name, event_time DESC);
CREATE INDEX idx_queue_events_linkedid ON queue_events(linkedid);

CREATE TABLE call_recordings (
  recording_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES call_sessions(call_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  linkedid VARCHAR(32) NOT NULL,
  recording_type VARCHAR(16) NOT NULL DEFAULT 'mixmonitor',
  file_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_format VARCHAR(16) NOT NULL DEFAULT 'wav',
  file_size_bytes BIGINT,
  storage_provider VARCHAR(32) DEFAULT 'local',
  recording_started_at TIMESTAMPTZ,
  recording_ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 VARCHAR(64),
  is_access_restricted BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE call_memos (
  memo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES call_sessions(call_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  agent_id UUID NOT NULL REFERENCES agents(agent_id),
  customer_id UUID NULL REFERENCES customers(customer_id),
  memo_type VARCHAR(16) NOT NULL DEFAULT 'acw',
  result_code VARCHAR(32),
  sub_result_code VARCHAR(32),
  memo_text TEXT,
  is_final BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE call_transfers (
  transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES call_sessions(call_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  linkedid VARCHAR(32) NOT NULL,
  transfer_type VARCHAR(16) NOT NULL,
  from_agent_id UUID NULL REFERENCES agents(agent_id),
  to_agent_id UUID NULL REFERENCES agents(agent_id),
  from_extension VARCHAR(16),
  to_extension VARCHAR(32),
  transfer_result VARCHAR(32),
  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE raw_ami_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  linkedid VARCHAR(32),
  uniqueid VARCHAR(32),
  event_name VARCHAR(64) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  sequence_no BIGSERIAL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_raw_ami_events_linkedid_event_time ON raw_ami_events(linkedid, event_time DESC);

CREATE TABLE event_outbox (
  outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  event_type VARCHAR(128) NOT NULL,
  aggregate_type VARCHAR(64),
  aggregate_id VARCHAR(64),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_event_outbox_published_created ON event_outbox(published_at, created_at);

INSERT INTO tenants (tenant_id, tenant_code, tenant_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'main', 'Main Call Center');

INSERT INTO queues (queue_id, tenant_id, queue_name, queue_exten, queue_display_name)
VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'sales', '6001', 'Sales Queue');

INSERT INTO agents (
  agent_id, tenant_id, login_id, login_password_hash, agent_code, agent_name, extension, role, default_queue_id
) VALUES (
  '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001',
  'agent1001', 'demo-hash', 'A1001', 'Agent 1001', '1001', 'agent',
  '00000000-0000-0000-0000-000000000101'
);
