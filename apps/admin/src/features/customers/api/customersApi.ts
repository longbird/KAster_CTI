import { apiClient } from '../../../shared/lib/apiClient';
import { USE_MOCK } from '../../../config';
import type { CustomerDetail, CustomerFormInput, CustomerHistoryItem, CustomerRow, ImportCustomerRow } from '../types/customer';

export interface CustomerListParams {
  keyword?: string;
  grade?: 'NORMAL' | 'VIP' | 'BLACK';
  registeredFrom?: string;
  registeredTo?: string;
  lastCalledFrom?: string;
  lastCalledTo?: string;
}

const mockCustomers: CustomerRow[] = [
  {
    customerId: 'mock-customer-1',
    customerName: '김민정',
    grade: 'VIP',
    memo: '예약 변경 이력 확인 필요',
    createdAt: '2026-05-01T09:00:00.000Z',
    updatedAt: '2026-05-05T09:00:00.000Z',
    lastCalledAt: '2026-05-05T08:42:00.000Z',
    primaryPhoneNumber: '01022347788',
    extraPhoneNumbers: ['021234567'],
    phones: [
      { customerPhoneId: 'mock-phone-1', phoneNumber: '01022347788', normalizedPhone: '01022347788', isPrimary: true, isActive: true },
    ],
  },
  {
    customerId: 'mock-customer-2',
    customerName: '박성호',
    grade: 'NORMAL',
    memo: '야간 배차 선호',
    createdAt: '2026-04-28T11:20:00.000Z',
    updatedAt: '2026-05-03T10:12:00.000Z',
    lastCalledAt: '2026-05-03T10:12:00.000Z',
    primaryPhoneNumber: '01088411255',
    extraPhoneNumbers: [],
    phones: [
      { customerPhoneId: 'mock-phone-2', phoneNumber: '01088411255', normalizedPhone: '01088411255', isPrimary: true, isActive: true },
    ],
  },
  {
    customerId: 'mock-customer-3',
    customerName: '이서연',
    grade: 'BLACK',
    memo: '수신거부 요청',
    createdAt: '2026-04-24T15:10:00.000Z',
    updatedAt: '2026-05-02T13:30:00.000Z',
    lastCalledAt: '2026-05-02T13:30:00.000Z',
    primaryPhoneNumber: '01033452229',
    extraPhoneNumbers: ['0312223333'],
    phones: [
      { customerPhoneId: 'mock-phone-3', phoneNumber: '01033452229', normalizedPhone: '01033452229', isPrimary: true, isActive: true },
    ],
  },
];

export const listCustomers = (params?: CustomerListParams) => {
  if (USE_MOCK) {
    const keyword = params?.keyword?.replace(/\D/g, '');
    return Promise.resolve(
      mockCustomers.filter((row) => {
        if (params?.grade && row.grade !== params.grade) return false;
        if (keyword && !row.primaryPhoneNumber?.includes(keyword)) return false;
        return true;
      }),
    );
  }
  return apiClient.get<{ data: CustomerRow[] }>('/customers', { params }).then((res) => res.data.data);
};

export const getCustomerDetail = (customerId: string) =>
  apiClient.get<{ data: CustomerDetail }>(`/customers/${customerId}`).then((res) => res.data.data);

export const getCustomerHistory = (customerId: string) =>
  apiClient.get<{ data: CustomerHistoryItem[] }>(`/customers/${customerId}/history`).then((res) => res.data.data);

export const createCustomer = (dto: CustomerFormInput) =>
  apiClient.post<{ data: CustomerRow }>('/customers', dto).then((res) => res.data.data);

export const updateCustomer = (customerId: string, dto: CustomerFormInput) =>
  apiClient.put<{ data: CustomerRow }>(`/customers/${customerId}`, dto).then((res) => res.data.data);

export const deleteCustomer = (customerId: string) =>
  apiClient.delete(`/customers/${customerId}`);

export const importCustomers = (rows: ImportCustomerRow[]) =>
  apiClient.post<{ data: { summary: { successCount: number; skippedCount: number; failedCount: number }; failures: Array<{ rowNumber: number; reason: string }> } }>(
    '/customers/import',
    { rows },
  ).then((res) => res.data.data);
