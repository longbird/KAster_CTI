import { apiClient } from '../../../shared/lib/apiClient';
import type {
  ListSmsTemplatesParams,
  SmsTemplateInput,
  SmsTemplateRow,
} from '../types/smsTemplate';

export async function listSmsTemplates(params?: ListSmsTemplatesParams) {
  const res = await apiClient.get('/sms-templates', { params });
  return (res.data?.data ?? []) as SmsTemplateRow[];
}

export async function createSmsTemplate(input: SmsTemplateInput) {
  const res = await apiClient.post('/sms-templates', input);
  return res.data?.data as SmsTemplateRow;
}

export async function updateSmsTemplate(templateId: string, input: Partial<SmsTemplateInput>) {
  const res = await apiClient.put(`/sms-templates/${templateId}`, input);
  return res.data?.data as SmsTemplateRow;
}

export async function deleteSmsTemplate(templateId: string) {
  const res = await apiClient.delete(`/sms-templates/${templateId}`);
  return res.data?.data as { deleted: boolean; templateId: string };
}
