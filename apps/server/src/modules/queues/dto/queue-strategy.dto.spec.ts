// 큐 DTO 는 중첩 DTO 를 @Type 으로 물고 있다. 런타임에 메타데이터가 없으면 import 부터 터진다.
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { CreateQueueDto } from './create-queue.dto';
import { UpdateQueueDto } from './update-queue.dto';

function strategyErrors(dto: object) {
  return validateSync(dto)
    .filter((error) => error.property === 'strategy')
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

/**
 * 생성과 수정이 같은 목록을 들고 있다. 한쪽만 고치면 큐를 만들 수는 있는데
 * 나중에 수정하려는 순간 400 이 나서, 운영자가 손댈 수 없는 큐가 생긴다.
 */
describe('큐 분배 전략 허용 목록', () => {
  it('동시 호출(ringall) 을 생성에서 받는다', () => {
    const dto = Object.assign(new CreateQueueDto(), {
      queueDisplayName: '대표 큐',
      strategy: 'ringall',
    });

    expect(strategyErrors(dto)).toEqual([]);
  });

  it('동시 호출(ringall) 을 수정에서도 받는다', () => {
    const dto = Object.assign(new UpdateQueueDto(), { strategy: 'ringall' });

    expect(strategyErrors(dto)).toEqual([]);
  });

  it('PBX 가 모르는 전략은 양쪽 모두 거절한다', () => {
    const created = Object.assign(new CreateQueueDto(), {
      queueDisplayName: '대표 큐',
      strategy: 'ringall-ish',
    });
    const updated = Object.assign(new UpdateQueueDto(), { strategy: 'ringall-ish' });

    expect(strategyErrors(created)).toContain('isIn');
    expect(strategyErrors(updated)).toContain('isIn');
  });
});
