import { apiClient } from '../../../shared/lib/apiClient';
import type {
  ConsultCategoryRow,
  CreateConsultCategoryInput,
  UpdateConsultCategoryInput,
} from '../types/consultCategory';

export async function listConsultCategories(params?: { activeOnly?: 'true' }) {
  const res = await apiClient.get('/admin/consult-categories', { params });
  return (res.data?.data ?? []) as ConsultCategoryRow[];
}

export async function createConsultCategory(input: CreateConsultCategoryInput) {
  const res = await apiClient.post('/admin/consult-categories', input);
  return res.data?.data as ConsultCategoryRow;
}

export async function updateConsultCategory(categoryId: string, input: UpdateConsultCategoryInput) {
  const res = await apiClient.patch(`/admin/consult-categories/${categoryId}`, input);
  return res.data?.data as ConsultCategoryRow;
}

export async function deleteConsultCategory(categoryId: string) {
  const res = await apiClient.delete(`/admin/consult-categories/${categoryId}`);
  return res.data?.data as { deleted: boolean; categoryId: string };
}
