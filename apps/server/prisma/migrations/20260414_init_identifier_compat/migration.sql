-- Normalize the original hand-written baseline schema to the quoted Prisma
-- identifiers expected by every follow-up migration.
--
-- The first baseline migration created snake_case table and column names. The
-- schema.prisma file and later migrations use camelCase physical identifiers,
-- so a fresh database failed at 20260414_ops_followup before this compatibility
-- step existed. Each rename is guarded so already-normalized databases can
-- apply this migration as a no-op.

CREATE OR REPLACE FUNCTION pg_temp.kaster_rename_table_if_exists(
  p_old_name text,
  p_new_name text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || quote_ident(p_old_name)) IS NOT NULL
     AND to_regclass('public.' || quote_ident(p_new_name)) IS NULL THEN
    EXECUTE format('ALTER TABLE public.%I RENAME TO %I', p_old_name, p_new_name);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.kaster_rename_column_if_exists(
  p_table_name text,
  p_old_name text,
  p_new_name text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_old_name
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_new_name
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.%I RENAME COLUMN %I TO %I',
      p_table_name,
      p_old_name,
      p_new_name
    );
  END IF;
END;
$$;

SELECT pg_temp.kaster_rename_table_if_exists('queue_agent_members', 'queueAgentMembers');
SELECT pg_temp.kaster_rename_table_if_exists('customer_phones', 'customerPhones');
SELECT pg_temp.kaster_rename_table_if_exists('agent_status_history', 'agentStatusHistory');
SELECT pg_temp.kaster_rename_table_if_exists('call_sessions', 'callSessions');
SELECT pg_temp.kaster_rename_table_if_exists('call_legs', 'callLegs');
SELECT pg_temp.kaster_rename_table_if_exists('queue_events', 'queueEvents');
SELECT pg_temp.kaster_rename_table_if_exists('call_recordings', 'callRecordings');
SELECT pg_temp.kaster_rename_table_if_exists('call_memos', 'callMemos');
SELECT pg_temp.kaster_rename_table_if_exists('call_transfers', 'callTransfers');
SELECT pg_temp.kaster_rename_table_if_exists('raw_ami_events', 'rawAmiEvents');
SELECT pg_temp.kaster_rename_table_if_exists('event_outbox', 'eventOutbox');

SELECT pg_temp.kaster_rename_column_if_exists('tenants', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('tenants', 'tenant_code', 'tenantCode');
SELECT pg_temp.kaster_rename_column_if_exists('tenants', 'tenant_name', 'tenantName');
SELECT pg_temp.kaster_rename_column_if_exists('tenants', 'is_active', 'isActive');
SELECT pg_temp.kaster_rename_column_if_exists('tenants', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('tenants', 'updated_at', 'updatedAt');

SELECT pg_temp.kaster_rename_column_if_exists('queues', 'queue_id', 'queueId');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'queue_name', 'queueName');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'queue_exten', 'queueExten');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'queue_display_name', 'queueDisplayName');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'ring_timeout_seconds', 'ringTimeoutSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'retry_seconds', 'retrySeconds');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'wrapup_seconds', 'wrapupSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'max_wait_seconds', 'maxWaitSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'is_active', 'isActive');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('queues', 'updated_at', 'updatedAt');

SELECT pg_temp.kaster_rename_column_if_exists('agents', 'agent_id', 'agentId');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'login_id', 'loginId');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'login_password_hash', 'loginPasswordHash');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'agent_code', 'agentCode');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'agent_name', 'agentName');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'sip_endpoint', 'sipEndpoint');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'employment_status', 'employmentStatus');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'default_queue_id', 'defaultQueueId');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'last_login_at', 'lastLoginAt');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'is_active', 'isActive');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('agents', 'updated_at', 'updatedAt');

SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'queue_member_id', 'queueMemberId');
SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'queue_id', 'queueId');
SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'agent_id', 'agentId');
SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'member_order', 'memberOrder');
SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'is_active', 'isActive');
SELECT pg_temp.kaster_rename_column_if_exists('queueAgentMembers', 'joined_at', 'joinedAt');

SELECT pg_temp.kaster_rename_column_if_exists('customers', 'customer_id', 'customerId');
SELECT pg_temp.kaster_rename_column_if_exists('customers', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('customers', 'customer_code', 'customerCode');
SELECT pg_temp.kaster_rename_column_if_exists('customers', 'customer_name', 'customerName');
SELECT pg_temp.kaster_rename_column_if_exists('customers', 'company_name', 'companyName');
SELECT pg_temp.kaster_rename_column_if_exists('customers', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('customers', 'updated_at', 'updatedAt');

SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'customer_phone_id', 'customerPhoneId');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'customer_id', 'customerId');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'phone_number', 'phoneNumber');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'normalized_phone', 'normalizedPhone');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'phone_type', 'phoneType');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'is_primary', 'isPrimary');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'is_active', 'isActive');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'verified_at', 'verifiedAt');
SELECT pg_temp.kaster_rename_column_if_exists('customerPhones', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'status_history_id', 'statusHistoryId');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'agent_id', 'agentId');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'status_code', 'statusCode');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'reason_code', 'reasonCode');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'reason_text', 'reasonText');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'source_type', 'sourceType');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'started_at', 'startedAt');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'ended_at', 'endedAt');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'duration_seconds', 'durationSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('agentStatusHistory', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'call_id', 'callId');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'ani_normalized', 'aniNormalized');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'did_number', 'didNumber');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'trunk_name', 'trunkName');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'queue_id', 'queueId');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'queue_name', 'queueName');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'customer_id', 'customerId');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'primary_agent_id', 'primaryAgentId');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'session_status', 'sessionStatus');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'campaign_code', 'campaignCode');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'result_code', 'resultCode');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'result_detail', 'resultDetail');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'abandon_flag', 'abandonFlag');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'transfer_flag', 'transferFlag');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'callback_flag', 'callbackFlag');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'recording_flag', 'recordingFlag');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'started_at', 'startedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'queued_at', 'queuedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'ringing_at', 'ringingAt');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'answered_at', 'answeredAt');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'ended_at', 'endedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'wait_seconds', 'waitSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'ring_seconds', 'ringSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'talk_seconds', 'talkSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'hold_seconds', 'holdSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'acw_seconds', 'acwSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('callSessions', 'updated_at', 'updatedAt');

SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'leg_id', 'legId');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'call_id', 'callId');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'parent_uniqueid', 'parentUniqueid');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'leg_type', 'legType');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'channel_name', 'channelName');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'bridged_channel_name', 'bridgedChannelName');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'agent_id', 'agentId');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'state_code', 'stateCode');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'dial_status', 'dialStatus');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'started_at', 'startedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'bridged_at', 'bridgedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'ended_at', 'endedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'duration_seconds', 'durationSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callLegs', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'queue_event_id', 'queueEventId');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'call_id', 'callId');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'queue_id', 'queueId');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'queue_name', 'queueName');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'agent_id', 'agentId');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'event_type', 'eventType');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'event_time', 'eventTime');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'wait_seconds', 'waitSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'ring_seconds', 'ringSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'position_no', 'positionNo');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'raw_payload', 'rawPayload');
SELECT pg_temp.kaster_rename_column_if_exists('queueEvents', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'recording_id', 'recordingId');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'call_id', 'callId');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'recording_type', 'recordingType');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'file_path', 'filePath');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'file_name', 'fileName');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'file_format', 'fileFormat');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'file_size_bytes', 'fileSizeBytes');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'storage_provider', 'storageProvider');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'recording_started_at', 'recordingStartedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'recording_ended_at', 'recordingEndedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'duration_seconds', 'durationSeconds');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'checksum_sha256', 'checksumSha256');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'is_access_restricted', 'isAccessRestricted');
SELECT pg_temp.kaster_rename_column_if_exists('callRecordings', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'memo_id', 'memoId');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'call_id', 'callId');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'agent_id', 'agentId');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'customer_id', 'customerId');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'memo_type', 'memoType');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'result_code', 'resultCode');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'sub_result_code', 'subResultCode');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'memo_text', 'memoText');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'is_final', 'isFinal');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('callMemos', 'updated_at', 'updatedAt');

SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'transfer_id', 'transferId');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'call_id', 'callId');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'transfer_type', 'transferType');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'from_agent_id', 'fromAgentId');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'to_agent_id', 'toAgentId');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'from_extension', 'fromExtension');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'to_extension', 'toExtension');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'transfer_result', 'transferResult');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'requested_at', 'requestedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'completed_at', 'completedAt');
SELECT pg_temp.kaster_rename_column_if_exists('callTransfers', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('rawAmiEvents', 'event_id', 'eventId');
SELECT pg_temp.kaster_rename_column_if_exists('rawAmiEvents', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('rawAmiEvents', 'event_name', 'eventName');
SELECT pg_temp.kaster_rename_column_if_exists('rawAmiEvents', 'event_time', 'eventTime');
SELECT pg_temp.kaster_rename_column_if_exists('rawAmiEvents', 'sequence_no', 'sequenceNo');
SELECT pg_temp.kaster_rename_column_if_exists('rawAmiEvents', 'created_at', 'createdAt');

SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'outbox_id', 'outboxId');
SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'tenant_id', 'tenantId');
SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'event_type', 'eventType');
SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'aggregate_type', 'aggregateType');
SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'aggregate_id', 'aggregateId');
SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'created_at', 'createdAt');
SELECT pg_temp.kaster_rename_column_if_exists('eventOutbox', 'published_at', 'publishedAt');
