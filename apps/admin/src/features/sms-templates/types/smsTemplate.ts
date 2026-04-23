export type SmsTemplateCategory = 'OPT_OUT_080' | 'GENERAL_NOTICE' | 'RESERVATION_ALERT';

export interface SmsTemplateRow {
  templateId: string;
  templateName: string;
  category: SmsTemplateCategory;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplateInput {
  templateName: string;
  category: SmsTemplateCategory;
  content: string;
  isActive: boolean;
}

export interface ListSmsTemplatesParams {
  keyword?: string;
  category?: SmsTemplateCategory;
  isActive?: 'true' | 'false';
}

export const SMS_TEMPLATE_CATEGORY_LABELS: Record<SmsTemplateCategory, string> = {
  OPT_OUT_080: '080 수신거부',
  GENERAL_NOTICE: '일반 안내',
  RESERVATION_ALERT: '예약·알림',
};

export const SMS_TEMPLATE_CATEGORY_OPTIONS = Object.entries(SMS_TEMPLATE_CATEGORY_LABELS).map(
  ([value, label]) => ({
    value: value as SmsTemplateCategory,
    label,
  }),
);
