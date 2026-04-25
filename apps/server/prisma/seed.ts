import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// conv 26 의 풍부한 시드 시나리오를 현재 schema (lowercase plural) 기준으로 옮김.
// 목적: QA/데모 시 바로 실제 화면이 "뭔가 들어찬" 상태를 볼 수 있게 한다.
//
// 생성 대상:
//   - tenants: main (사용자 고정 UUID)
//   - agents: agent1001 (일반), supervisor1 (슈퍼바이저)
//   - queues: sales + queueAgentMembers 2건
//   - customers: 김고객 + customerPhones 1건
//   - callSessions: TALKING 진행 중 통화 1건
//     - callLegs: inbound trunk leg + agent leg
//     - queueEvents: JOIN + AGENT_CONNECT
//     - callTransfers: supervisor 로의 attended 전환 완료 이력

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Password123!';

// 고정 UUID 를 쓰는 이유: AmiEventNormalizerService 가 이벤트에 TenantId 가
// 없을 때 이 값으로 폴백한다. 시드/런타임이 같은 테넌트를 보게 하기 위함.
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const QUEUE_ID = '00000000-0000-0000-0000-000000000101';
const AGENT_ID = '00000000-0000-0000-0000-000000000201';
const SUPERVISOR_ID = '00000000-0000-0000-0000-000000000202';

const SMART_ARS_PROMPTS = [
  {
    promptKey: 'custom/smart_ars_guide',
    displayName: '스마트 ARS 안내',
    fileName: 'smart_ars_guide.wav',
    description: '0번 상담원 연결, 1번 수신거부, 2번 이용 안내 선택 멘트',
  },
  {
    promptKey: 'custom/smart_ars_invalid',
    displayName: '스마트 ARS 오입력',
    fileName: 'smart_ars_invalid.wav',
    description: '정의되지 않은 DTMF 입력 안내 멘트',
  },
  {
    promptKey: 'custom/smart_ars_fail',
    displayName: '스마트 ARS 실패',
    fileName: 'smart_ars_fail.wav',
    description: '재시도 초과 또는 실행 실패 안내 멘트',
  },
  {
    promptKey: 'custom/smart_ars_info',
    displayName: '스마트 ARS 이용 안내',
    fileName: 'smart_ars_info.wav',
    description: 'PLAY_PROMPT 동작 검증용 안내 멘트',
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.tenants.upsert({
    where: { tenantCode: 'main' },
    update: {},
    create: {
      tenantId: TENANT_ID,
      tenantCode: 'main',
      tenantName: 'Main Call Center',
    },
  });

  const salesQueue = await prisma.queues.upsert({
    where: { tenantId_queueName: { tenantId: TENANT_ID, queueName: 'sales' } },
    update: {},
    create: {
      queueId: QUEUE_ID,
      tenantId: TENANT_ID,
      queueName: 'sales',
      queueExten: '6001',
      queueDisplayName: '영업 대표 큐',
    },
  });

  const agent1001 = await prisma.agents.upsert({
    where: { tenantId_loginId: { tenantId: TENANT_ID, loginId: 'agent1001' } },
    update: { loginPasswordHash: passwordHash },
    create: {
      agentId: AGENT_ID,
      tenantId: TENANT_ID,
      loginId: 'agent1001',
      loginPasswordHash: passwordHash,
      agentCode: 'A1001',
      agentName: '홍길동',
      extension: '1001',
      role: 'agent',
      defaultQueueId: QUEUE_ID,
    },
  });

  const supervisor = await prisma.agents.upsert({
    where: { tenantId_loginId: { tenantId: TENANT_ID, loginId: 'supervisor1' } },
    update: { loginPasswordHash: passwordHash },
    create: {
      agentId: SUPERVISOR_ID,
      tenantId: TENANT_ID,
      loginId: 'supervisor1',
      loginPasswordHash: passwordHash,
      agentCode: 'S2001',
      agentName: '관리자',
      extension: '2001',
      role: 'supervisor',
      defaultQueueId: QUEUE_ID,
    },
  });

  await prisma.queueAgentMembers.upsert({
    where: { queueId_agentId: { queueId: salesQueue.queueId, agentId: agent1001.agentId } },
    update: {},
    create: {
      tenantId: TENANT_ID,
      queueId: salesQueue.queueId,
      agentId: agent1001.agentId,
    },
  });

  await prisma.queueAgentMembers.upsert({
    where: { queueId_agentId: { queueId: salesQueue.queueId, agentId: supervisor.agentId } },
    update: {},
    create: {
      tenantId: TENANT_ID,
      queueId: salesQueue.queueId,
      agentId: supervisor.agentId,
    },
  });

  for (const prompt of SMART_ARS_PROMPTS) {
    await prisma.asteriskPrompt.upsert({
      where: {
        tenantId_promptKey: {
          tenantId: TENANT_ID,
          promptKey: prompt.promptKey,
        },
      },
      update: {
        displayName: prompt.displayName,
        fileName: prompt.fileName,
        category: 'smart_ars',
        description: prompt.description,
        isActive: true,
      },
      create: {
        tenantId: TENANT_ID,
        promptKey: prompt.promptKey,
        displayName: prompt.displayName,
        fileName: prompt.fileName,
        category: 'smart_ars',
        description: prompt.description,
        isActive: true,
      },
    });
  }

  // 시드는 여러 번 돌려도 되도록 upsert 패턴을 쓰지만, 데모용 콜 세션은
  // 매번 새로 만든다. 이미 있으면 건너뛴다.
  const existingDemoCall = await prisma.callSessions.findFirst({
    where: { tenantId: TENANT_ID, linkedid: { startsWith: 'L-demo-' } },
  });
  if (existingDemoCall) {
    console.log({ seeded: true, demoCallReused: existingDemoCall.callId });
    return;
  }

  const customer = await prisma.customers.create({
    data: {
      tenantId: TENANT_ID,
      customerCode: 'C0001',
      customerName: '김고객',
      grade: 'VIP',
      phones: {
        create: [
          {
            phoneNumber: '01012345678',
            normalizedPhone: '01012345678',
            phoneType: 'mobile',
            isPrimary: true,
          },
        ],
      },
    },
  });

  const now = Date.now();
  const linkedid = `L-demo-${now}`;

  const call = await prisma.callSessions.create({
    data: {
      tenantId: TENANT_ID,
      linkedid,
      direction: 'inbound',
      ani: '01012345678',
      aniNormalized: '01012345678',
      dnis: '07012345678',
      didNumber: '07012345678',
      trunkName: 'trunk-provider',
      queueId: salesQueue.queueId,
      queueName: salesQueue.queueName,
      customerId: customer.customerId,
      primaryAgentId: agent1001.agentId,
      sessionStatus: 'TALKING',
      recordingFlag: true,
      startedAt: new Date(now - 120_000),
      queuedAt: new Date(now - 110_000),
      ringingAt: new Date(now - 90_000),
      answeredAt: new Date(now - 80_000),
      waitSeconds: 20,
      ringSeconds: 10,
      talkSeconds: 80,
      callLegs: {
        create: [
          {
            tenantId: TENANT_ID,
            linkedid,
            uniqueid: `U-IN-${now}`,
            legType: 'inbound',
            channelName: 'PJSIP/trunk-provider-0000001',
            startedAt: new Date(now - 120_000),
            bridgedAt: new Date(now - 80_000),
          },
          {
            tenantId: TENANT_ID,
            linkedid,
            uniqueid: `U-AGENT-${now}`,
            legType: 'agent',
            channelName: 'PJSIP/1001-0000002',
            agentId: agent1001.agentId,
            startedAt: new Date(now - 90_000),
            bridgedAt: new Date(now - 80_000),
          },
        ],
      },
      queueEvents: {
        create: [
          {
            tenantId: TENANT_ID,
            linkedid,
            queueId: salesQueue.queueId,
            queueName: salesQueue.queueName,
            eventType: 'JOIN',
            eventTime: new Date(now - 110_000),
          },
          {
            tenantId: TENANT_ID,
            linkedid,
            queueId: salesQueue.queueId,
            queueName: salesQueue.queueName,
            agentId: agent1001.agentId,
            eventType: 'AGENT_CONNECT',
            eventTime: new Date(now - 80_000),
          },
        ],
      },
      callTransfers: {
        create: {
          tenantId: TENANT_ID,
          linkedid,
          transferType: 'attended',
          fromAgentId: agent1001.agentId,
          toAgentId: supervisor.agentId,
          fromExtension: '1001',
          toExtension: '2001',
          transferResult: 'COMPLETED',
          requestedAt: new Date(now - 30_000),
          completedAt: new Date(now - 20_000),
        },
      },
    },
  });

  console.log({
    tenant: 'main',
    agents: [agent1001.loginId, supervisor.loginId],
    queue: salesQueue.queueName,
    callId: call.callId,
    linkedid,
    demoPassword: DEMO_PASSWORD,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
