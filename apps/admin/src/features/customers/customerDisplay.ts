import dayjs from 'dayjs';
import { formatPhoneNumber } from '../../shared/lib/format';

export function formatCustomerPhoneDisplay(value?: string | null): string {
  return formatPhoneNumber(value);
}

export function formatCustomerListDate(value?: string | null): string {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD');
}
