import { QUEUE_PAUSING_STATUS_CODES } from '../calls/agent-availability.util';
import { AgentMonitoringService } from './agent-monitoring.service';

describe('AgentMonitoringService', () => {
  // 화면의 "일시정지" 와 실제 큐 pause 가 다른 목록에서 나오면, 관리자는
  // 쉬는 것으로 보이는 상담원에게 전화가 계속 들어가는 이유를 못 찾는다.
  it('counts exactly the statuses that actually pause the queue member', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { agentStatusHistory: { count } } as any;
    const service = new AgentMonitoringService(prisma);

    await service.getSummary('tenant-1');

    const pausedQuery = count.mock.calls.find(
      ([args]) => Array.isArray(args?.where?.statusCode?.in),
    );
    expect(pausedQuery).toBeDefined();
    expect([...pausedQuery[0].where.statusCode.in].sort()).toEqual(
      [...QUEUE_PAUSING_STATUS_CODES].sort(),
    );
  });
});
