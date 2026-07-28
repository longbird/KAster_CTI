import { apiClient } from '../../../shared/lib/apiClient';
import type { CustomerDetail, CustomerFormInput, CustomerHistoryItem, CustomerRow, ImportCustomerRow } from '../types/customer';

export interface CustomerListParams {
  keyword?: string;
  grade?: 'NORMAL' | 'VIP' | 'BLACK';
  registeredFrom?: string;
  registeredTo?: string;
  lastCalledFrom?: string;
  lastCalledTo?: string;
}

export const listCustomers = (params?: CustomerListParams) =>
  apiClient.get<{ data: CustomerRow[] }>('/customers', { params }).then((res) => res.data.data);

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
