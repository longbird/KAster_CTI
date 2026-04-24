import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CustomersPage } from './CustomersPage';

vi.mock('../../store/usePermissionStore', () => ({
  usePermissionStore: (selector: (state: unknown) => unknown) =>
    selector({
      permissionsByMenu: {
        customers: {
          canCreate: true,
          canExport: true,
          canUpdate: true,
          canDelete: true,
        },
      },
    }),
}));

vi.mock('./CustomerDetailDrawer', () => ({
  CustomerDetailDrawer: () => null,
}));

vi.mock('./CustomerFormModal', () => ({
  CustomerFormModal: () => null,
}));

vi.mock('./CustomerImportModal', () => ({
  CustomerImportModal: () => null,
}));

describe('CustomersPage layout', () => {
  it('separates the page header and filter toolbar into distinct blocks', () => {
    const html = renderToStaticMarkup(<CustomersPage />);

    expect(html).toContain('customers-page__header');
    expect(html).toContain('customers-page__heading');
    expect(html).toContain('customers-page__toolbar');
    expect(html).toContain('customers-page__filters');
  });
});
