import { Form, Input, Select, message } from 'antd';
import { useEffect, useState } from 'react';
import type { ActiveCall } from '../types/cti';

interface Props {
  call?: ActiveCall;
  onSaveMemo: (memo: string, resultCode: string) => Promise<void>;
  onTransfer: (target: string, mode?: 'blind' | 'attended') => Promise<void>;
  onCancelAttendedTransfer: () => Promise<void>;
  onCompleteAttendedTransfer: () => Promise<void>;
  onHangup: () => Promise<void>;
}

const RESULT_CODES = [
  { value: 'ORDER_COMPLETE', label: '주문 완료' },
  { value: 'FOLLOW_UP', label: '후속 조치 필요' },
  { value: 'CALLBACK', label: '콜백 예약' },
  { value: 'SOLD', label: '판매 완료' },
  { value: 'NO_INTEREST', label: '관심 없음' },
  { value: 'COMPLAINT', label: '불만 접수' },
  { value: 'TECH_ISSUE', label: '기술 이슈' },
  { value: 'INQUIRY', label: '단순 문의' },
  { value: 'OTHER', label: '기타' },
];

type Tab = 'memo' | 'control' | 'kb';

const KB_LIBRARY = [
  {
    id: 'opening',
    title: '기본 응대 오프닝',
    tags: ['opening', 'greeting', 'basic'],
    body: '안녕하세요. KAster 상담센터입니다. 문의하신 내용 확인 도와드리겠습니다.',
  },
  {
    id: 'vip',
    title: 'VIP 고객 응대',
    tags: ['vip', 'priority', 'premium'],
    body: 'VIP 고객으로 확인되었습니다. 최근 이용 이력과 기존 요청사항을 우선 확인한 뒤 바로 처리 가능 범위를 안내합니다.',
  },
  {
    id: 'callback',
    title: '콜백 안내',
    tags: ['callback', 'followup'],
    body: '즉시 처리 어려운 건은 확인 담당자 지정 후 콜백 예정 시간과 연락 수단을 먼저 확정합니다.',
  },
  {
    id: 'claim',
    title: '민원 응대',
    tags: ['complaint', 'claim', 'issue'],
    body: '불편을 먼저 인정하고, 발생 시각·구간·상대 정보·재현 여부를 빠르게 수집한 뒤 처리 기준을 설명합니다.',
  },
  {
    id: 'transfer',
    title: '전환 전 안내',
    tags: ['transfer', 'consult', 'handoff'],
    body: '전환 사유와 대상 부서를 먼저 알리고, 고객이 대기 중임을 명확히 안내한 뒤 메모를 남깁니다.',
  },
];

// "The Precision Curator" 의 Memo / Action 카드. 탭 + 미니멀 form 입력.
export function ControlPanel({
  call,
  onSaveMemo,
  onTransfer,
  onCancelAttendedTransfer,
  onCompleteAttendedTransfer,
  onHangup,
}: Props) {
  const [tab, setTab] = useState<Tab>('memo');
  const [kbQuery, setKbQuery] = useState('');
  const [form] = Form.useForm<{ memo: string; resultCode: string; transferTarget: string }>();
  const hasOpenConsult = !!call?.latestTransfer
    && ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'].includes(call.latestTransfer.phase);
  const kbHints = [
    call?.customer?.grade === 'VIP' ? 'vip' : '',
    call?.resultCode?.toLowerCase() ?? '',
    call?.latestTransfer ? 'transfer' : '',
    call?.customer?.memo?.toLowerCase() ?? '',
  ].filter(Boolean);
  const normalizedKbQuery = kbQuery.trim().toLowerCase();
  const knowledgeItems = KB_LIBRARY.filter((item) => {
    const haystack = [item.title, item.body, ...item.tags, ...kbHints].join(' ').toLowerCase();
    return normalizedKbQuery
      ? haystack.includes(normalizedKbQuery)
      : item.tags.some((tag) => kbHints.some((hint) => hint.includes(tag) || tag.includes(hint)));
  });
  const displayedKnowledgeItems = knowledgeItems.length > 0 ? knowledgeItems : KB_LIBRARY.slice(0, 3);

  useEffect(() => {
    form.setFieldsValue({
      memo: call?.memo ?? '',
      resultCode: call?.resultCode ?? 'ORDER_COMPLETE',
      transferTarget: '',
    });
  }, [call?.callId, form]);

  return (
    <div className="flex h-full flex-col rounded-lg bg-surface-container-lowest p-8 shadow-panel">
      {/* 탭 */}
      <div className="mb-8 flex items-center gap-8 border-b border-outline-variant/15">
        <TabButton active={tab === 'memo'} onClick={() => setTab('memo')}>
          메모 / 후처리
        </TabButton>
        <TabButton active={tab === 'control'} onClick={() => setTab('control')}>
          제어
        </TabButton>
        <TabButton active={tab === 'kb'} onClick={() => setTab('kb')}>
          상담 가이드
        </TabButton>
      </div>

      {tab === 'memo' && (
        <Form
          form={form}
          layout="vertical"
          className="flex flex-1 flex-col"
          onFinish={async (values) => {
            await onSaveMemo(values.memo, values.resultCode);
            message.success('메모를 저장했습니다');
          }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Form.Item
              name="resultCode"
              label={<FormLabel>처리 결과</FormLabel>}
              className="!mb-0"
            >
              <Select
                options={RESULT_CODES}
                suffixIcon={
                  <span className="material-symbols-outlined text-on-surface-variant">
                    expand_more
                  </span>
                }
                size="large"
                className="rounded-lg"
              />
            </Form.Item>
            <Form.Item
              name="transferTarget"
              label={<FormLabel>전환 내선</FormLabel>}
              className="!mb-0"
            >
              <Input placeholder="예: 5501" size="large" />
            </Form.Item>
          </div>

          <div className="mt-6 flex flex-1 flex-col">
            <FormLabel>상담 메모</FormLabel>
            <Form.Item name="memo" className="!mb-0 flex flex-1 flex-col">
              <Input.TextArea
                rows={8}
                placeholder="상담 메모를 입력하세요..."
                className="!min-h-[200px] !resize-none !rounded-lg"
                style={{ background: '#e1e3e4' }}
              />
            </Form.Item>
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={!call}
                onClick={async () => {
                  const target = form.getFieldValue('transferTarget');
                  if (!target) {
                    message.warning('전환할 내선을 먼저 입력해 주세요');
                    return;
                  }
                  await onTransfer(target, 'blind');
                  message.success(`블라인드 전환을 요청했습니다: ${target}`);
                }}
                className="rounded-xl border border-outline-variant px-6 py-3 text-sm font-bold text-on-surface transition-all hover:bg-surface-container-low active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                블라인드 전환
              </button>
              <button
                type="button"
                disabled={!call}
                onClick={async () => {
                  const target = form.getFieldValue('transferTarget');
                  if (!target) {
                    message.warning('전환할 내선을 먼저 입력해 주세요');
                    return;
                  }
                  await onTransfer(target, 'attended');
                  message.success(`상담 전환을 요청했습니다: ${target}`);
                }}
                className="rounded-xl border border-primary/30 px-6 py-3 text-sm font-bold text-primary transition-all hover:bg-primary/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                상담 전환
              </button>
              <button
                type="button"
                disabled={!call}
                onClick={async () => {
                  await onHangup();
                  message.success('통화 종료를 요청했습니다');
                }}
                className="rounded-xl border border-error/30 px-6 py-3 text-sm font-bold text-error transition-all hover:bg-error-container/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                통화 종료
              </button>
            </div>
            <button
              type="submit"
              className="btn-primary-gradient rounded-xl px-12 py-3 font-headline text-sm font-bold shadow-lg shadow-primary/20"
            >
              메모 저장
            </button>
          </div>
        </Form>
      )}

      {tab === 'control' && (
        <div className="flex flex-1 flex-col justify-center gap-5">
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              상담 전환
            </p>
            <p className="mt-2 text-sm text-on-surface">
              {hasOpenConsult
                ? `진행 중: ${call?.latestTransfer?.phase} -> ${call?.latestTransfer?.toExtension ?? '-'}`
                : '진행 중인 상담 전환이 없습니다.'}
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={!hasOpenConsult}
                onClick={async () => {
                  await onCompleteAttendedTransfer();
                  message.success('상담 전환 완료를 요청했습니다');
                }}
                className="rounded-xl border border-primary/30 px-5 py-3 text-sm font-bold text-primary transition-all hover:bg-primary/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전환 완료
              </button>
              <button
                type="button"
                disabled={!hasOpenConsult}
                onClick={async () => {
                  await onCancelAttendedTransfer();
                  message.success('상담 전환을 취소했습니다');
                }}
                className="rounded-xl border border-error/30 px-5 py-3 text-sm font-bold text-error transition-all hover:bg-error-container/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                전환 취소
              </button>
            </div>
          </div>
          <div className="text-sm text-outline">
            완료는 Asterisk attended transfer 최종 동작과 후속 `AttendedTransfer` 이벤트에 의해 확정됩니다.
          </div>
        </div>
      )}

      {tab === 'kb' && (
        <div className="flex flex-1 flex-col gap-5">
          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              빠른 검색
            </p>
            <Input
              value={kbQuery}
              onChange={(event) => setKbQuery(event.target.value)}
              placeholder="VIP, 콜백, 민원, 전환..."
              size="large"
              className="mt-3"
            />
            <p className="mt-3 text-xs text-outline">
              고객 등급, 최근 전환 상태, 메모 키워드를 기준으로 기본 가이드를 우선 노출합니다.
            </p>
          </div>
          <div className="grid gap-4">
            {displayedKnowledgeItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-on-surface">{item.title}</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {item.id === 'opening'
                      ? '기본 응대'
                      : item.id === 'vip'
                        ? 'VIP'
                        : item.id === 'callback'
                          ? '콜백'
                          : item.id === 'claim'
                            ? '민원'
                            : '전환'}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-on-surface-variant">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-4 text-sm font-bold transition-colors ${
        active
          ? 'border-b-2 border-primary text-primary'
          : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
      {children}
    </span>
  );
}
