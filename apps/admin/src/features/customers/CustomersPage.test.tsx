import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';

import { buildCustomerListParams, CustomersPage } from './CustomersPage';

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

  it('uses a single date range picker with an explicit date filter selector', () => {
    const html = renderToStaticMarkup(<CustomersPage />);

    expect(html).toContain('customers-page__date-filter');
    expect(html).toContain('customers-page__date-range');
    expect(html).toContain('width:108px');
    expect(html).toContain('width:120px');
    expect(html).toContain('width:250px');
    expect(html.match(/class="ant-picker ant-picker-range /g)?.length ?? 0).toBe(1);
  });

  it('places the keyword search immediately before the search button', () => {
    const html = renderToStaticMarkup(<CustomersPage />);
    const keywordIndex = html.indexOf('placeholder="전화번호 또는 성명 검색"');
    const dateRangeIndex = html.indexOf('customers-page__date-range');
    const searchButtonIndex = html.indexOf('>조회<');

    expect(keywordIndex).toBeGreaterThan(dateRangeIndex);
    expect(searchButtonIndex).toBeGreaterThan(keywordIndex);
  });
});

describe('buildCustomerListParams', () => {
  it('maps the selected date range to registered dates by default', () => {
    const range = [dayjs('2026-04-01T09:00:00'), dayjs('2026-04-03T18:00:00')] as const;

    expect(
      buildCustomerListParams({
        keyword: '010',
        grade: 'VIP',
        dateFilterType: 'registered',
        dateRange: range,
      }),
    ).toMatchObject({
      keyword: '010',
      grade: 'VIP',
      registeredFrom: range[0].startOf('day').toISOString(),
      registeredTo: range[1].endOf('day').toISOString(),
      lastCalledFrom: undefined,
      lastCalledTo: undefined,
    });
  });

  it('maps the selected date range to last-called dates when requested', () => {
    const range = [dayjs('2026-04-11T09:00:00'), dayjs('2026-04-12T18:00:00')] as const;

    expect(
      buildCustomerListParams({
        keyword: '',
        grade: undefined,
        dateFilterType: 'lastCalled',
        dateRange: range,
      }),
    ).toMatchObject({
      keyword: undefined,
      grade: undefined,
      registeredFrom: undefined,
      registeredTo: undefined,
      lastCalledFrom: range[0].startOf('day').toISOString(),
      lastCalledTo: range[1].endOf('day').toISOString(),
    });
  });
});
