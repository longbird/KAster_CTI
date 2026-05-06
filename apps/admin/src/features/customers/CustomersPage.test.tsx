import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import { Form } from 'antd';

import { buildCustomerListParams, CustomersPage } from './CustomersPage';
import { formatCustomerListDate, formatCustomerPhoneDisplay } from './customerDisplay';
import { buildCustomerFormValues, normalizeCustomerFormValues } from './CustomerFormFields';
import { CustomerDetailSummary } from './CustomerDetailSummary';

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

    expect(html).toContain('admin-workbench');
    expect(html).toContain('admin-workbench__filters');
    expect(html).toContain('admin-workbench__table');
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

  it('keeps the additional-phone header on one line with an explicit column width', () => {
    const html = renderToStaticMarkup(<CustomersPage />);

    expect(html).toContain('customers-page__table-header');
    expect(html).not.toContain('>추가전화번호<');
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

describe('customer list display helpers', () => {
  it('formats phone numbers for display without changing the stored value', () => {
    expect(formatCustomerPhoneDisplay('01012345678')).toBe('010-1234-5678');
    expect(formatCustomerPhoneDisplay('021234567')).toBe('02-123-4567');
    expect(formatCustomerPhoneDisplay('15881234')).toBe('1588-1234');
    expect(formatCustomerPhoneDisplay(null)).toBe('-');
  });

  it('shows customer list dates as date-only values', () => {
    expect(formatCustomerListDate('2026-04-24T09:30:00Z')).toBe('2026-04-24');
    expect(formatCustomerListDate(null)).toBe('-');
  });
});

describe('customer form helpers', () => {
  it('builds edit form values from the customer record', () => {
    expect(
      buildCustomerFormValues({
        customerId: 'customer-1',
        customerName: '김고객',
        grade: 'VIP',
        memo: '메모',
        createdAt: '2026-04-24T00:00:00Z',
        updatedAt: '2026-04-24T00:00:00Z',
        primaryPhoneNumber: '01012345678',
        extraPhoneNumbers: ['021234567'],
        phones: [
          { customerPhoneId: 'phone-1', phoneNumber: '01012345678', normalizedPhone: '01012345678', isPrimary: true, isActive: true },
          { customerPhoneId: 'phone-2', phoneNumber: '021234567', normalizedPhone: '021234567', isPrimary: false, isActive: true },
        ],
      }),
    ).toMatchObject({
      customerName: '김고객',
      grade: 'VIP',
      memo: '메모',
      primaryPhoneNumber: '01012345678',
      extraPhoneNumbersText: '021234567',
    });
  });

  it('normalizes drawer form values back into the api payload', () => {
    expect(
      normalizeCustomerFormValues({
        customerName: '김고객',
        grade: 'NORMAL',
        memo: '메모',
        primaryPhoneNumber: '01012345678',
        extraPhoneNumbersText: '021234567\n0312345678',
      }),
    ).toEqual({
      customerName: '김고객',
      grade: 'NORMAL',
      memo: '메모',
      primaryPhoneNumber: '01012345678',
      extraPhoneNumbers: ['021234567', '0312345678'],
    });
  });
});

describe('customer detail summary', () => {
  const detail = {
    customerId: 'customer-1',
    customerName: '김고객',
    grade: 'VIP' as const,
    memo: '상세 메모',
    createdAt: '2026-04-24T00:00:00Z',
    updatedAt: '2026-04-24T00:00:00Z',
    lastCalledAt: '2026-04-25T00:00:00Z',
    primaryPhoneNumber: '01012345678',
    extraPhoneNumbers: ['021234567'],
    phones: [
      { customerPhoneId: 'phone-1', phoneNumber: '01012345678', normalizedPhone: '01012345678', isPrimary: true, isActive: true },
      { customerPhoneId: 'phone-2', phoneNumber: '021234567', normalizedPhone: '021234567', isPrimary: false, isActive: true },
    ],
    recentCalls: [],
  };

  it('keeps the same detail layout while showing read-only values', () => {
    const html = renderToStaticMarkup(<CustomerDetailSummary detail={detail} editing={false} />);

    expect(html).toContain('대표 전화번호');
    expect(html).toContain('010-1234-5678');
    expect(html).toContain('02-123-4567');
    expect(html).toContain('2026-04-25');
  });

  it('renders editable controls inside the same detail summary layout', () => {
    const html = renderToStaticMarkup(
      <Form initialValues={buildCustomerFormValues(detail, detail.grade)}>
        <CustomerDetailSummary detail={detail} editing />
      </Form>,
    );

    expect(html).toContain('대표 전화번호');
    expect(html).toContain('value="01012345678"');
    expect(html).toContain('줄바꿈 또는 쉼표로 구분');
    expect(html).toContain('상세 메모');
  });
});
