import { describe, expect, it, vi } from 'vitest';

describe('listCustomers', () => {
  it('loads customer rows from the backend API', async () => {
    vi.resetModules();
    const get = vi.fn(() => Promise.resolve({ data: { data: [{ customerId: 'customer-1', primaryPhoneNumber: '01012345678' }] } }));
    vi.doMock('../../../shared/lib/apiClient', () => ({ apiClient: { get } }));

    const { listCustomers } = await import('./customersApi');
    const rows = await listCustomers({ keyword: '010' });

    expect(get).toHaveBeenCalledWith('/customers', { params: { keyword: '010' } });
    expect(rows).toEqual([{ customerId: 'customer-1', primaryPhoneNumber: '01012345678' }]);
  });
});
