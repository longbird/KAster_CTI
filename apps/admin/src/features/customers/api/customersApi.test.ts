import { describe, expect, it, vi } from 'vitest';

describe('listCustomers', () => {
  it('returns built-in customer rows in mock mode without calling the backend', async () => {
    vi.resetModules();
    vi.doMock('../../../config', () => ({ USE_MOCK: true }));
    const get = vi.fn();
    vi.doMock('../../../shared/lib/apiClient', () => ({ apiClient: { get } }));

    const { listCustomers } = await import('./customersApi');
    const rows = await listCustomers();

    expect(get).not.toHaveBeenCalled();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('primaryPhoneNumber');
  });
});
