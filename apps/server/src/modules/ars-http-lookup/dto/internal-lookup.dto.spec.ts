import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InternalArsLookupDto } from './internal-lookup.dto';

function errorsFor(payload: Record<string, unknown>): string[] {
  return validateSync(plainToInstance(InternalArsLookupDto, payload))
    .flatMap((error) => Object.values(error.constraints ?? {}));
}

const SEEDED_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const GENERATED_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('InternalArsLookupDto', () => {
  it('시드가 만든 테넌트 id 를 받는다 — 이 시스템이 실제로 쓰는 값이다', () => {
    expect(errorsFor({ tenantId: SEEDED_TENANT_ID, endpointId: GENERATED_ID })).toEqual([]);
  });

  it('DB 가 만든 id 도 받는다', () => {
    expect(errorsFor({ tenantId: GENERATED_ID, endpointId: GENERATED_ID })).toEqual([]);
  });

  it('UUID 모양이 아니면 막는다', () => {
    expect(errorsFor({ tenantId: 'nope', endpointId: GENERATED_ID }).join(' ')).toMatch(/tenantId/);
    expect(errorsFor({ tenantId: SEEDED_TENANT_ID, endpointId: '1; drop table' }).join(' ')).toMatch(/endpointId/);
  });

  it('채널에서 온 값들은 길이만 묶는다', () => {
    const errors = errorsFor({
      tenantId: SEEDED_TENANT_ID,
      endpointId: GENERATED_ID,
      caller: 'x'.repeat(65),
    });

    expect(errors.join(' ')).toMatch(/caller/);
  });

  it('선택 값은 없어도 된다', () => {
    expect(errorsFor({ tenantId: SEEDED_TENANT_ID, endpointId: GENERATED_ID })).toEqual([]);
  });
});
