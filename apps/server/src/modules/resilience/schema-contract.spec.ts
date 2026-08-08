import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const RESILIENCE_MODELS = [
  'configVersions',
  'configApplyStatus',
  'configEmergencyChanges',
  'offlineSpoolEntries',
  'replayBatches',
  'recoveryAuditLog',
] as const;

const MIGRATION_SQL = join(
  __dirname,
  '../../../prisma/migrations/20260808_db_resilience/migration.sql',
);

describe('DB resilience schema contract', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(RESILIENCE_MODELS)('Prisma 클라이언트가 %s 모델을 노출한다', (model) => {
    expect((prisma as any)[model]).toBeDefined();
  });

  it('migration SQL 이 schema.prisma 와 같은 테이블 집합을 만든다', () => {
    const sql = readFileSync(MIGRATION_SQL, 'utf8');

    for (const model of RESILIENCE_MODELS) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${model}"`);
    }
  });

  it('version 계열 컬럼이 BIGINT 가 아니다', () => {
    // Prisma BigInt 는 JSON.stringify 에서 TypeError 를 던져
    // ResponseTransformInterceptor 의 응답 래핑을 깨뜨린다.
    const sql = readFileSync(MIGRATION_SQL, 'utf8');
    const versionColumns = sql.match(/"\w*[Vv]ersion"\s+\w+/g) ?? [];

    expect(versionColumns.length).toBeGreaterThan(0);
    for (const column of versionColumns) {
      expect(column).not.toMatch(/BIGINT/i);
    }
  });

  it('감사 테이블은 상담원 FK 를 걸지 않는다', () => {
    // 감사 기록은 참조 대상(상담원)이 삭제돼도 남아야 한다.
    const sql = readFileSync(MIGRATION_SQL, 'utf8');

    expect(sql).not.toMatch(/REFERENCES\s+"agents"/i);
  });
});
