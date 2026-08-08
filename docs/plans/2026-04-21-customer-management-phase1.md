# Customer Management Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 앱에 고객관리 도메인을 추가하고, 고객 CRUD/Import/Export/이력 조회와 상담원 실시간 고객 요약 표시를 구현한다.

**Architecture:** 기존 `customers`/`customerPhones` 스키마를 확장해 고객 관리 API를 먼저 완성하고, 관리자 앱에는 `고객관리 > 고객 목록 / 블랙리스트 고객 관리`를 추가한다. 상담원 앱과 실시간 이벤트는 기존 `customer` 요약 구조를 유지하되 `BLACK` 등급, 최종통화일, 최근 이력 5건을 수용하도록 타입과 렌더링을 확장한다.

**Tech Stack:** NestJS, Prisma, PostgreSQL, React, Vite, Ant Design, Zustand, TypeScript

---

## File Structure

### Server

- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20260421_customer_management_phase1/migration.sql`
- Create: `apps/server/test/jest.config.js`
- Create: `apps/server/src/modules/customers/dto/customer-list.query.dto.ts`
- Create: `apps/server/src/modules/customers/dto/create-customer.dto.ts`
- Create: `apps/server/src/modules/customers/dto/update-customer.dto.ts`
- Create: `apps/server/src/modules/customers/dto/import-customers.dto.ts`
- Modify: `apps/server/src/modules/customers/customers.controller.ts`
- Modify: `apps/server/src/modules/customers/customers.service.ts`
- Modify: `apps/server/src/modules/calls/session-engine.service.ts`
- Modify: `apps/server/src/modules/calls/calls.service.ts`
- Modify: `apps/server/src/modules/outbox/outbox-publisher.service.ts`
- Modify: `apps/server/src/common/menu-permission.service.ts`
- Create: `apps/server/src/modules/customers/customers.service.spec.ts`

### Admin

- Modify: `apps/admin/src/shared/permissions/menuConfig.tsx`
- Modify: `apps/admin/src/app/router.tsx`
- Modify: `apps/admin/src/store/usePermissionStore.ts`
- Create: `apps/admin/src/features/customers/api/customersApi.ts`
- Create: `apps/admin/src/features/customers/types/customer.ts`
- Create: `apps/admin/src/features/customers/CustomersPage.tsx`
- Create: `apps/admin/src/features/customers/BlacklistCustomersPage.tsx`
- Create: `apps/admin/src/features/customers/CustomerFormModal.tsx`
- Create: `apps/admin/src/features/customers/CustomerDetailDrawer.tsx`
- Create: `apps/admin/src/features/customers/CustomerImportModal.tsx`
- Modify: `apps/admin/src/styles.css`
- Create: `apps/admin/src/features/customers/__tests__/customer-page.spec.tsx`

### Web

- Modify: `apps/web/src/types/cti.ts`
- Modify: `apps/web/src/api/realApi.ts`
- Modify: `apps/web/src/components/CurrentCallPanel.tsx`
- Modify: `apps/web/src/layout/FullShell.tsx`
- Modify: `apps/web/src/layout/MiniShell.tsx`

## Task 1: Add Customer Management Test Harness And Schema

**Files:**
- Create: `apps/server/test/jest.config.js`
- Modify: `apps/server/package.json`
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/20260421_customer_management_phase1/migration.sql`
- Create: `apps/server/src/modules/customers/customers.service.spec.ts`

- [ ] **Step 1: Write the failing schema/service test**

```ts
import { CustomersService } from './customers.service';

describe('CustomersService phone rules', () => {
  it('rejects duplicate normalized phones in one tenant', async () => {
    const prisma = {
      customerPhones: {
        findFirst: jest.fn().mockResolvedValue({
          customerPhoneId: 'phone-1',
          normalizedPhone: '01012341234',
          customer: { tenantId: 'tenant-1', customerId: 'customer-1' },
        }),
      },
    } as any;

    const service = new CustomersService(prisma);

    await expect(
      service['assertPhonesAvailable']('tenant-1', ['01012341234']),
    ).rejects.toThrow('이미 다른 고객에 등록된 전화번호');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts`  
Expected: FAIL because Jest config/script and helper do not exist yet

- [ ] **Step 3: Add server test script and Jest config**

```json
{
  "scripts": {
    "test": "jest --config test/jest.config.js --runInBand"
  }
}
```

```js
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
```

- [ ] **Step 4: Extend Prisma schema for customer operations**

```prisma
model customers {
  customerId     String    @id @default(uuid()) @db.Uuid
  tenantId       String    @db.Uuid
  customerCode   String?   @db.VarChar(32)
  customerName   String?   @db.VarChar(128)
  companyName    String?   @db.VarChar(128)
  grade          String?   @default("NORMAL") @db.VarChar(32)
  status         String?   @default("active") @db.VarChar(32)
  memo           String?
  lastCalledAt   DateTime? @db.Timestamptz(6)
  createdAt      DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime  @default(now()) @db.Timestamptz(6)
}

model customerPhones {
  customerPhoneId String   @id @default(uuid()) @db.Uuid
  customerId      String   @db.Uuid
  phoneNumber     String   @db.VarChar(32)
  normalizedPhone String   @db.VarChar(32)
  phoneType       String   @default("mobile") @db.VarChar(16)
  isPrimary       Boolean  @default(false)
  isActive        Boolean  @default(true)

  @@unique([customerId, normalizedPhone])
  @@index([normalizedPhone])
}
```

- [ ] **Step 5: Add the migration**

```sql
ALTER TABLE "customers" ADD COLUMN "lastCalledAt" TIMESTAMPTZ(6);
ALTER TABLE "customers" ALTER COLUMN "grade" SET DEFAULT 'NORMAL';
CREATE UNIQUE INDEX "customerPhones_customerId_normalizedPhone_key"
  ON "customerPhones" ("customerId", "normalizedPhone");
```

- [ ] **Step 6: Run tests and Prisma validation**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts`  
Expected: FAIL now at missing `assertPhonesAvailable`

Run: `npx prisma validate`  
Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 7: Commit**

```bash
git add apps/server/package.json apps/server/test/jest.config.js apps/server/prisma/schema.prisma apps/server/prisma/migrations/20260421_customer_management_phase1/migration.sql apps/server/src/modules/customers/customers.service.spec.ts
git commit -m "Add customer management schema and test harness"
```

## Task 2: Implement Customer CRUD, List, Detail, Import, Export APIs

**Files:**
- Create: `apps/server/src/modules/customers/dto/customer-list.query.dto.ts`
- Create: `apps/server/src/modules/customers/dto/create-customer.dto.ts`
- Create: `apps/server/src/modules/customers/dto/update-customer.dto.ts`
- Create: `apps/server/src/modules/customers/dto/import-customers.dto.ts`
- Modify: `apps/server/src/modules/customers/customers.controller.ts`
- Modify: `apps/server/src/modules/customers/customers.service.ts`
- Modify: `apps/server/src/modules/customers/customers.service.spec.ts`

- [ ] **Step 1: Write the failing API/service tests**

```ts
it('creates a customer with one primary phone and optional extra phones', async () => {
  const dto = {
    customerName: '홍길동',
    grade: 'VIP',
    memo: '테스트 메모',
    primaryPhoneNumber: '010-1234-5678',
    extraPhoneNumbers: ['02-555-1234'],
  };

  prisma.customerPhones.findFirst.mockResolvedValue(null);
  prisma.customers.create.mockResolvedValue({
    customerId: 'customer-1',
    customerName: '홍길동',
    grade: 'VIP',
    memo: '테스트 메모',
    phones: [
      { phoneNumber: '010-1234-5678', normalizedPhone: '01012345678', isPrimary: true },
      { phoneNumber: '02-555-1234', normalizedPhone: '025551234', isPrimary: false },
    ],
  });

  await expect(service.createCustomer('tenant-1', dto)).resolves.toMatchObject({
    success: true,
    data: {
      customerName: '홍길동',
      phones: expect.arrayContaining([
        expect.objectContaining({ isPrimary: true }),
      ]),
    },
  });
});
```

```ts
it('imports xlsx/csv rows and reports skipped duplicates', async () => {
  const result = await service.importCustomers('tenant-1', [
    { 대표전화번호: '01011112222', 성명: '신규고객', 등급: 'NORMAL' },
    { 대표전화번호: '01012341234', 성명: '중복고객', 등급: 'VIP' },
  ]);

  expect(result.data.summary).toEqual({
    successCount: 1,
    skippedCount: 1,
    failedCount: 0,
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts`  
Expected: FAIL because `createCustomer` and `importCustomers` do not exist

- [ ] **Step 3: Add DTOs and controller endpoints**

```ts
@Get()
list(@CurrentUser() user: any, @Query() query: CustomerListQueryDto) {
  return this.customersService.listCustomers(user.tenantId, query);
}

@Post()
create(@CurrentUser() user: any, @Body() dto: CreateCustomerDto) {
  return this.customersService.createCustomer(user.tenantId, dto);
}

@Put(':customerId')
update(@CurrentUser() user: any, @Param('customerId') customerId: string, @Body() dto: UpdateCustomerDto) {
  return this.customersService.updateCustomer(user.tenantId, customerId, dto);
}

@Post('import')
import(@CurrentUser() user: any, @Body() dto: ImportCustomersDto) {
  return this.customersService.importCustomers(user.tenantId, dto.rows);
}

@Get(':customerId/history')
history(@CurrentUser() user: any, @Param('customerId') customerId: string) {
  return this.customersService.getCustomerHistory(user.tenantId, customerId);
}
```

- [ ] **Step 4: Implement the minimal service methods**

```ts
async createCustomer(tenantId: string, dto: CreateCustomerDto) {
  const normalizedPhones = [
    normalizePhone(dto.primaryPhoneNumber),
    ...(dto.extraPhoneNumbers ?? []).map((value) => normalizePhone(value)).filter(Boolean),
  ];
  await this.assertPhonesAvailable(tenantId, normalizedPhones);

  const customer = await this.prisma.customers.create({
    data: {
      tenantId,
      customerName: dto.customerName,
      grade: dto.grade ?? 'NORMAL',
      memo: dto.memo ?? null,
      phones: {
        create: [
          {
            phoneNumber: dto.primaryPhoneNumber,
            normalizedPhone: normalizePhone(dto.primaryPhoneNumber),
            isPrimary: true,
          },
          ...(dto.extraPhoneNumbers ?? []).map((phoneNumber) => ({
            phoneNumber,
            normalizedPhone: normalizePhone(phoneNumber),
            isPrimary: false,
          })),
        ],
      },
    },
    include: { phones: { where: { isActive: true } } },
  });

  return { success: true, data: customer, error: null };
}
```

```ts
async importCustomers(tenantId: string, rows: ImportCustomerRow[]) {
  const summary = { successCount: 0, skippedCount: 0, failedCount: 0 };
  const failures: Array<{ rowNumber: number; reason: string }> = [];

  for (const [index, row] of rows.entries()) {
    try {
      await this.createCustomer(tenantId, {
        customerName: row.성명,
        grade: row.등급 ?? 'NORMAL',
        memo: row.기본메모 ?? '',
        primaryPhoneNumber: row.대표전화번호,
        extraPhoneNumbers: [row.추가전화번호1, row.추가전화번호2].filter(Boolean) as string[],
      });
      summary.successCount += 1;
    } catch (error: any) {
      if (String(error?.message).includes('이미 다른 고객에 등록된 전화번호')) {
        summary.skippedCount += 1;
      } else {
        summary.failedCount += 1;
        failures.push({ rowNumber: index + 1, reason: error?.message ?? '알 수 없는 오류' });
      }
    }
  }

  return { success: true, data: { summary, failures }, error: null };
}
```

- [ ] **Step 5: Add history/list/export queries**

```ts
async getCustomerHistory(tenantId: string, customerId: string) {
  const history = await this.prisma.callSessions.findMany({
    where: { tenantId, customerId },
    orderBy: { startedAt: 'desc' },
    take: 50,
    select: {
      callId: true,
      direction: true,
      sessionStatus: true,
      startedAt: true,
      endedAt: true,
      talkSeconds: true,
      queueName: true,
      primaryAgent: { select: { agentName: true } },
    },
  });
  return { success: true, data: history, error: null };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts`  
Expected: PASS with all customer service tests green

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/modules/customers/dto apps/server/src/modules/customers/customers.controller.ts apps/server/src/modules/customers/customers.service.ts apps/server/src/modules/customers/customers.service.spec.ts
git commit -m "Add customer management CRUD and import APIs"
```

## Task 3: Attach Customers To Calls And Realtime Summaries

**Files:**
- Modify: `apps/server/src/modules/calls/session-engine.service.ts`
- Modify: `apps/server/src/modules/calls/calls.service.ts`
- Modify: `apps/server/src/modules/outbox/outbox-publisher.service.ts`
- Modify: `apps/server/src/modules/customers/customers.service.spec.ts`

- [ ] **Step 1: Write the failing matching/update tests**

```ts
it('fills customerId from ANI phone match when session has no customerId', async () => {
  prisma.customerPhones.findFirst.mockResolvedValue({
    customer: { customerId: 'customer-1', tenantId: 'tenant-1' },
  });

  const customer = await service['resolveCustomerByPhone']('tenant-1', '010-2222-3333');

  expect(customer).toEqual({ customerId: 'customer-1', tenantId: 'tenant-1' });
});
```

```ts
it('updates lastCalledAt when a matched call ends', async () => {
  prisma.customers.update.mockResolvedValue({});

  await service['touchLastCalledAt']('tenant-1', 'customer-1', new Date('2026-04-21T09:00:00Z'));

  expect(prisma.customers.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { customerId: 'customer-1' },
      data: { lastCalledAt: new Date('2026-04-21T09:00:00Z') },
    }),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts`  
Expected: FAIL because helper methods and last-called update flow do not exist

- [ ] **Step 3: Set customerId when sessions are created or updated**

```ts
const matchedCustomer = await this.resolveCustomerByPhone(
  tenantId,
  normalized.ani ?? normalized.raw?.CallerIDNum ?? '',
);

const created = await tx.callSessions.create({
  data: {
    tenantId,
    linkedid,
    direction: normalized.direction ?? 'inbound',
    ani: normalized.ani ?? null,
    aniNormalized: normalizePhone(normalized.ani ?? ''),
    dnis: normalized.dnis ?? null,
    customerId: matchedCustomer?.customerId ?? null,
    sessionStatus: nextStatus,
    startedAt: normalized.eventTime ?? new Date(),
  },
});
```

- [ ] **Step 4: Update lastCalledAt on call end and enrich summaries**

```ts
if (nextStatus === 'ENDED' && existing.customerId) {
  await tx.customers.update({
    where: { customerId: existing.customerId },
    data: { lastCalledAt: endedAt },
  });
}
```

```ts
return {
  customerId: customer.customerId,
  customerName: customer.customerName ?? '미식별 고객',
  grade: customer.grade ?? 'NORMAL',
  phoneNumber: customer.phones[0]?.phoneNumber ?? '',
  memo: customer.memo ?? undefined,
  lastCalledAt: customer.lastCalledAt?.toISOString(),
  recentCalls,
};
```

- [ ] **Step 5: Run targeted build/test verification**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts`  
Expected: PASS

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/server`  
Expected: `nest build` exits 0

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/modules/calls/session-engine.service.ts apps/server/src/modules/calls/calls.service.ts apps/server/src/modules/outbox/outbox-publisher.service.ts apps/server/src/modules/customers/customers.service.spec.ts
git commit -m "Attach customers to call sessions and realtime summaries"
```

## Task 4: Add Customer Management Routes, Permissions, And Shared Admin API

**Files:**
- Modify: `apps/admin/src/shared/permissions/menuConfig.tsx`
- Modify: `apps/admin/src/app/router.tsx`
- Modify: `apps/admin/src/store/usePermissionStore.ts`
- Modify: `apps/server/src/common/menu-permission.service.ts`
- Create: `apps/admin/src/features/customers/types/customer.ts`
- Create: `apps/admin/src/features/customers/api/customersApi.ts`

- [ ] **Step 1: Write the failing admin route/API smoke test**

```ts
import { labelForMenuPath } from '../../../shared/permissions/menuConfig';

test('customer management menu exposes both routes', () => {
  expect(labelForMenuPath('/customers')).toBe('고객 목록');
  expect(labelForMenuPath('/customers/blacklist')).toBe('블랙리스트 고객 관리');
});
```

- [ ] **Step 2: Run test/build check to verify it fails**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/admin`  
Expected: FAIL after adding the test import because menu keys do not exist yet

- [ ] **Step 3: Add menu and route entries**

```tsx
{
  key: 'customers-root',
  icon: <TeamOutlined />,
  label: '고객관리',
  children: [
    { key: '/customers', label: '고객 목록' },
    { key: '/customers/blacklist', label: '블랙리스트 고객 관리' },
  ],
}
```

```tsx
{ path: 'customers', element: <CustomersPage /> },
{ path: 'customers/blacklist', element: <BlacklistCustomersPage /> },
```

- [ ] **Step 4: Add shared customer types and API client**

```ts
export interface CustomerRow {
  customerId: string;
  customerName: string | null;
  grade: 'NORMAL' | 'VIP' | 'BLACK';
  memo?: string | null;
  lastCalledAt?: string | null;
  phones: Array<{
    customerPhoneId: string;
    phoneNumber: string;
    isPrimary: boolean;
  }>;
}
```

```ts
export const listCustomers = (params?: Record<string, unknown>) =>
  apiClient.get('/customers', { params }).then((res) => res.data.data);

export const createCustomer = (dto: CreateCustomerInput) =>
  apiClient.post('/customers', dto).then((res) => res.data.data);

export const importCustomers = (rows: ImportCustomerRow[]) =>
  apiClient.post('/customers/import', { rows }).then((res) => res.data.data);
```

- [ ] **Step 5: Add permission keys on server**

```ts
'customers',
'customers/blacklist',
```

- [ ] **Step 6: Run admin/server builds**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/admin`  
Expected: PASS

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/server`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/shared/permissions/menuConfig.tsx apps/admin/src/app/router.tsx apps/admin/src/store/usePermissionStore.ts apps/server/src/common/menu-permission.service.ts apps/admin/src/features/customers/types/customer.ts apps/admin/src/features/customers/api/customersApi.ts
git commit -m "Add customer management routes and permissions"
```

## Task 5: Build Admin Customer Pages, Detail Drawer, And Import Flow

**Files:**
- Create: `apps/admin/src/features/customers/CustomersPage.tsx`
- Create: `apps/admin/src/features/customers/BlacklistCustomersPage.tsx`
- Create: `apps/admin/src/features/customers/CustomerFormModal.tsx`
- Create: `apps/admin/src/features/customers/CustomerDetailDrawer.tsx`
- Create: `apps/admin/src/features/customers/CustomerImportModal.tsx`
- Modify: `apps/admin/src/styles.css`
- Create: `apps/admin/src/features/customers/__tests__/customer-page.spec.tsx`

- [ ] **Step 1: Write the failing customer page test**

```tsx
import { render, screen } from '@testing-library/react';
import { CustomersPage } from '../CustomersPage';

test('renders customer list actions and blacklist filter link', () => {
  render(<CustomersPage />);
  expect(screen.getByText('고객 목록')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '고객 등록' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '파일 가져오기' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test or build to verify it fails**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/admin`  
Expected: FAIL because page components do not exist

- [ ] **Step 3: Implement the customer list page**

```tsx
export function CustomersPage() {
  const permission = usePermissionStore((state) => state.permissionsByMenu['customers']);
  const [rows, setRows] = useState<CustomerRow[]>([]);

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>고객 목록</Typography.Title>
          <Typography.Text type="secondary">대표 전화번호 기준으로 고객을 관리합니다.</Typography.Text>
        </div>
        <Space>
          {permission?.canCreate !== false ? <Button type="primary">고객 등록</Button> : null}
          {permission?.canCreate !== false ? <Button>파일 가져오기</Button> : null}
          {permission?.canExport !== false ? <Button>내보내기</Button> : null}
        </Space>
      </Space>
      <Table rowKey="customerId" dataSource={rows} />
    </Card>
  );
}
```

- [ ] **Step 4: Implement detail drawer and import modal**

```tsx
export function CustomerDetailDrawer({ open, customerId, onClose }: Props) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    if (!open || !customerId) return;
    void getCustomerDetail(customerId).then(setDetail);
  }, [open, customerId]);

  return (
    <Drawer open={open} onClose={onClose} width={720} title="고객 상세">
      <Descriptions column={1}>
        <Descriptions.Item label="성명">{detail?.customerName ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="등급">{detail?.grade ?? 'NORMAL'}</Descriptions.Item>
        <Descriptions.Item label="기본 메모">{detail?.memo ?? '-'}</Descriptions.Item>
      </Descriptions>
    </Drawer>
  );
}
```

```tsx
export function CustomerImportModal({ open, onClose, onImported }: Props) {
  const [rows, setRows] = useState<ImportCustomerRow[]>([]);
  return (
    <Modal open={open} onCancel={onClose} onOk={() => void onImported(rows)}>
      <Alert type="info" message="xlsx/csv/txt 템플릿만 지원합니다." />
    </Modal>
  );
}
```

- [ ] **Step 5: Implement blacklist customer page as filtered customer list**

```tsx
export function BlacklistCustomersPage() {
  return <CustomersPage initialGrade="BLACK" title="블랙리스트 고객 관리" />;
}
```

- [ ] **Step 6: Run admin build**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/admin`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/features/customers apps/admin/src/styles.css
git commit -m "Build admin customer management pages"
```

## Task 6: Update Web Customer Summary Types And Rendering

**Files:**
- Modify: `apps/web/src/types/cti.ts`
- Modify: `apps/web/src/api/realApi.ts`
- Modify: `apps/web/src/components/CurrentCallPanel.tsx`
- Modify: `apps/web/src/layout/FullShell.tsx`
- Modify: `apps/web/src/layout/MiniShell.tsx`

- [ ] **Step 1: Write the failing type/render expectation**

```ts
export interface Customer {
  customerId: string;
  customerName: string;
  grade: 'VIP' | 'BLACK' | 'NORMAL';
  phoneNumber: string;
  memo?: string;
  lastCalledAt?: string;
  recentCalls?: Array<{
    callId: string;
    direction: string;
    startedAt: string;
    queueName?: string | null;
  }>;
}
```

- [ ] **Step 2: Run web build to verify it fails**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/web`  
Expected: FAIL where existing code still assumes old `Customer` shape

- [ ] **Step 3: Update API mapper and panels**

```ts
customer: c.customer
  ? {
      customerId: c.customer.customerId,
      customerName: c.customer.customerName ?? '미식별 고객',
      grade: c.customer.grade ?? 'NORMAL',
      phoneNumber: c.customer.phoneNumber ?? c.ani ?? '',
      memo: c.customer.memo ?? undefined,
      lastCalledAt: c.customer.lastCalledAt ?? undefined,
      recentCalls: Array.isArray(c.customer.recentCalls) ? c.customer.recentCalls : [],
    }
  : undefined,
```

```tsx
{customer?.memo ? (
  <div className="mt-3 rounded-md border border-outline-variant/20 p-3 text-xs">
    {customer.memo}
  </div>
) : null}
{customer?.lastCalledAt ? (
  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
    최종통화일 {new Date(customer.lastCalledAt).toLocaleString('ko-KR')}
  </div>
) : null}
```

- [ ] **Step 4: Show summary-only recent calls in web layouts**

```tsx
{selectedCall.customer?.recentCalls?.slice(0, 5).map((item) => (
  <div key={item.callId} className="text-xs text-outline">
    {new Date(item.startedAt).toLocaleString('ko-KR')} · {item.direction} · {item.queueName ?? '-'}
  </div>
))}
```

- [ ] **Step 5: Run web build**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/web`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/types/cti.ts apps/web/src/api/realApi.ts apps/web/src/components/CurrentCallPanel.tsx apps/web/src/layout/FullShell.tsx apps/web/src/layout/MiniShell.tsx
git commit -m "Show customer summaries in agent web app"
```

## Task 7: Final Integration Verification And Deployment Notes

**Files:**
- Modify: `docs/design/2026-04-21-customer-management-phase1-design.md`
- Create: `docs/qa/2026-04-21-customer-management-phase1-verification.md`

- [ ] **Step 1: Add a manual verification checklist**

```md
# Customer Management Phase 1 Verification

- 고객 목록에서 신규 고객 등록 가능
- 대표번호 중복 등록 차단
- xlsx/csv/txt import 결과 summary 표시
- 블랙리스트 고객 관리에서 BLACK 고객만 조회
- 인입 통화에서 고객 요약, 메모, 최종통화일, 최근 5건 표시
- 고객 상세에서 수/발신 이력 조회
```

- [ ] **Step 2: Run full builds**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/server`  
Expected: `nest build` exits 0

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/admin`  
Expected: `vite build` exits 0

Run: `& 'C:\Program Files\nodejs\npm.cmd' run build` in `apps/web`  
Expected: `vite build` exits 0

- [ ] **Step 3: Run server tests**

Run: `& 'C:\Program Files\nodejs\npm.cmd' run test -- customers.service.spec.ts` in `apps/server`  
Expected: PASS

- [ ] **Step 4: Record deployment order**

```md
1. `cd apps/server && npx prisma generate`
2. `cd apps/server && npx prisma migrate deploy` (baseline 이슈 시 운영 규칙에 맞춘 sync 절차 적용)
3. `cd apps/server && npm run build`
4. `cd apps/admin && npm run build`
5. `cd apps/web && npm run build`
6. 운영 server/admin/web 재시작
```

- [ ] **Step 5: Commit**

```bash
git add docs/qa/2026-04-21-customer-management-phase1-verification.md docs/design/2026-04-21-customer-management-phase1-design.md
git commit -m "Add customer management verification checklist"
```

## Self-Review

### Spec coverage

- 고객관리 메뉴/권한: Task 4, Task 5
- 고객 CRUD/상세/이력: Task 2
- Import/Export: Task 2, Task 5
- 블랙리스트 고객 관리: Task 5
- 상담원/실시간 고객 요약: Task 3, Task 6
- 2단계 080 실제 차단 제외: 계획에 포함하지 않음

### Placeholder scan

- `TBD`, `TODO`, `적절히`, `나중에` 같은 문구 없음
- 각 task에 파일, 명령, 코드 스니펫 포함

### Type consistency

- 고객 등급은 `NORMAL | VIP | BLACK`로 통일
- 대표 전화번호는 `primaryPhoneNumber`
- 고객 요약의 최근 이력은 `recentCalls`

