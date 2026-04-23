import { CustomersService, normalizeGrade } from './customers.service';

describe('CustomersService phone rules', () => {
  it('creates a customer with one primary phone and optional extra phones', async () => {
    const prisma = {
      customerPhones: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      customers: {
        create: jest.fn().mockResolvedValue({
          customerId: 'customer-1',
          customerName: '홍길동',
          grade: 'VIP',
          memo: '테스트 메모',
          phones: [
            { phoneNumber: '010-1234-5678', normalizedPhone: '01012345678', isPrimary: true },
            { phoneNumber: '02-555-1234', normalizedPhone: '025551234', isPrimary: false },
          ],
        }),
      },
    } as any;

    const service = new CustomersService(prisma);
    const dto = {
      customerName: '홍길동',
      grade: 'VIP',
      memo: '테스트 메모',
      primaryPhoneNumber: '010-1234-5678',
      extraPhoneNumbers: ['02-555-1234'],
    };

    await expect(service.createCustomer('tenant-1', dto as any)).resolves.toMatchObject({
      success: true,
      data: {
        customerName: '홍길동',
        phones: expect.arrayContaining([
          expect.objectContaining({ isPrimary: true }),
        ]),
      },
    });
  });

  it('imports rows and reports skipped duplicates', async () => {
    const prisma = {
      customerPhones: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            customerPhoneId: 'phone-1',
            normalizedPhone: '01012341234',
            customer: { tenantId: 'tenant-1', customerId: 'customer-1' },
          }),
      },
      customers: {
        create: jest.fn().mockResolvedValue({
          customerId: 'customer-2',
          customerName: '신규고객',
          grade: 'NORMAL',
          memo: null,
          phones: [
            { phoneNumber: '01011112222', normalizedPhone: '01011112222', isPrimary: true },
          ],
        }),
      },
    } as any;

    const service = new CustomersService(prisma);
    const result = await service.importCustomers('tenant-1', [
      { 대표전화번호: '01011112222', 성명: '신규고객', 등급: 'NORMAL' },
      { 대표전화번호: '01012341234', 성명: '중복고객', 등급: 'VIP' },
    ] as any);

    expect(result.data.summary).toEqual({
      successCount: 1,
      skippedCount: 1,
      failedCount: 0,
    });
  });

  it('normalizes imported grade labels before saving', async () => {
    const prisma = {
      customerPhones: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      customers: {
        create: jest.fn().mockResolvedValue({
          customerId: 'customer-3',
          customerName: '등급고객',
          grade: 'NORMAL',
          memo: null,
          phones: [
            { phoneNumber: '01099998888', normalizedPhone: '01099998888', isPrimary: true },
          ],
        }),
      },
    } as any;

    const service = new CustomersService(prisma);
    await service.importCustomers('tenant-1', [
      { 대표전화번호: '01099998888', 성명: '등급고객', 등급: '일반' },
    ] as any);

    expect(prisma.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grade: 'NORMAL',
        }),
      }),
    );
  });

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
      (service as any).assertPhonesAvailable('tenant-1', ['01012341234']),
    ).rejects.toThrow('이미 다른 고객에 등록된 전화번호');
  });

  it('maps korean and english grade labels to internal codes', () => {
    expect(normalizeGrade('일반')).toBe('NORMAL');
    expect(normalizeGrade('vip')).toBe('VIP');
    expect(normalizeGrade('BLACK')).toBe('BLACK');
  });
});
