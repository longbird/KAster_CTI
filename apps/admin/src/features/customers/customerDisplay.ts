import dayjs from 'dayjs';

export function formatCustomerPhoneDisplay(value?: string | null): string {
  if (!value) return '-';
  const digits = value.replace(/\D/g, '');

  if (/^15\d{6}$|^16\d{6}$|^18\d{6}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return value;
}

export function formatCustomerListDate(value?: string | null): string {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD');
}
