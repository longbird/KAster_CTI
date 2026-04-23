import { CustomersController } from './customers.controller';

describe('CustomersController permissions', () => {
  it('checks customers menu permission when listing black customers', async () => {
    const customersService = {
      listCustomers: jest.fn().mockResolvedValue({ success: true, data: [], error: null }),
    };
    const menuPermissionService = {
      assertMenuAction: jest.fn().mockResolvedValue(undefined),
    };

    const controller = new CustomersController(
      customersService as any,
      menuPermissionService as any,
    );

    await controller.list(
      { tenantId: 'tenant-1', role: 'supervisor', sub: 'agent-1' } as any,
      { grade: 'BLACK' } as any,
    );

    expect(menuPermissionService.assertMenuAction).toHaveBeenCalledWith(
      'tenant-1',
      'supervisor',
      'customers',
      'view',
      'agent-1',
    );
  });
});
