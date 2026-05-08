export interface CustomerPhone {
  customerPhoneId: string;
  phoneNumber: string;
  normalizedPhone: string;
  isPrimary: boolean;
  isActive: boolean;
}

export interface CustomerHistoryItem {
  callId: string;
  direction: string;
  sessionStatus: string;
  startedAt: string;
  endedAt?: string | null;
  talkSeconds: number;
  queueName?: string | null;
  primaryAgent?: { agentName: string } | null;
}

export interface CustomerRow {
  customerId: string;
  customerName: string | null;
  grade: 'NORMAL' | 'VIP' | 'BLACK';
  memo?: string | null;
  shareRuleId?: string | null;
  createdAt: string;
  updatedAt: string;
  lastCalledAt?: string | null;
  primaryPhoneNumber?: string | null;
  extraPhoneNumbers?: string[];
  phones: CustomerPhone[];
}

export interface CustomerDetail extends CustomerRow {
  recentCalls: CustomerHistoryItem[];
}

export interface CustomerFormInput {
  customerName: string;
  grade?: 'NORMAL' | 'VIP' | 'BLACK';
  memo?: string;
  shareRuleId?: string | null;
  primaryPhoneNumber: string;
  extraPhoneNumbers?: string[];
}

export interface ImportCustomerRow {
  대표전화번호: string;
  성명: string;
  등급?: string;
  추가전화번호1?: string;
  추가전화번호2?: string;
  기본메모?: string;
}
