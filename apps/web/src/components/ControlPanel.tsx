import { Form, Input, Select, message } from 'antd';
import { useEffect, useState } from 'react';
import type { ActiveCall } from '../types/cti';

interface Props {
  call?: ActiveCall;
  onSaveMemo: (memo: string, resultCode: string) => Promise<void>;
  onTransfer: (target: string) => Promise<void>;
  onHangup: () => Promise<void>;
}

const RESULT_CODES = [
  { value: 'ORDER_COMPLETE', label: 'Order Complete' },
  { value: 'FOLLOW_UP', label: 'Follow-up Required' },
  { value: 'CALLBACK', label: 'Callback Scheduled' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'NO_INTEREST', label: 'No Interest' },
  { value: 'COMPLAINT', label: 'Complaint' },
  { value: 'TECH_ISSUE', label: 'Technical Issue' },
  { value: 'INQUIRY', label: 'Inquiry Only' },
  { value: 'OTHER', label: 'Other' },
];

type Tab = 'memo' | 'control' | 'kb';

// "The Precision Curator" 의 Memo / Action 카드. 탭 + 미니멀 form 입력.
export function ControlPanel({ call, onSaveMemo, onTransfer, onHangup }: Props) {
  const [tab, setTab] = useState<Tab>('memo');
  const [form] = Form.useForm<{ memo: string; resultCode: string; transferTarget: string }>();

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
          Memo / After-call
        </TabButton>
        <TabButton active={tab === 'control'} onClick={() => setTab('control')}>
          Control
        </TabButton>
        <TabButton active={tab === 'kb'} onClick={() => setTab('kb')}>
          Knowledge Base
        </TabButton>
      </div>

      {tab === 'memo' && (
        <Form
          form={form}
          layout="vertical"
          className="flex flex-1 flex-col"
          onFinish={async (values) => {
            await onSaveMemo(values.memo, values.resultCode);
            message.success('Memo saved');
          }}
        >
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Form.Item
              name="resultCode"
              label={<FormLabel>Result Code</FormLabel>}
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
              label={<FormLabel>Transfer Extension</FormLabel>}
              className="!mb-0"
            >
              <Input placeholder="e.g. 5501" size="large" />
            </Form.Item>
          </div>

          <div className="mt-6 flex flex-1 flex-col">
            <FormLabel>Consultation Memo</FormLabel>
            <Form.Item name="memo" className="!mb-0 flex flex-1 flex-col">
              <Input.TextArea
                rows={8}
                placeholder="Type session notes here..."
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
                    message.warning('Enter transfer extension first');
                    return;
                  }
                  await onTransfer(target);
                  message.success(`Transfer requested: ${target}`);
                }}
                className="rounded-xl border border-outline-variant px-6 py-3 text-sm font-bold text-on-surface transition-all hover:bg-surface-container-low active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Transfer
              </button>
              <button
                type="button"
                disabled={!call}
                onClick={async () => {
                  await onHangup();
                  message.success('End call requested');
                }}
                className="rounded-xl border border-error/30 px-6 py-3 text-sm font-bold text-error transition-all hover:bg-error-container/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                End Call
              </button>
            </div>
            <button
              type="submit"
              className="btn-primary-gradient rounded-xl px-12 py-3 font-headline text-sm font-bold shadow-lg shadow-primary/20"
            >
              Save Memo
            </button>
          </div>
        </Form>
      )}

      {tab === 'control' && (
        <div className="flex flex-1 items-center justify-center text-center text-outline">
          <div>
            <span className="material-symbols-outlined text-5xl">tune</span>
            <p className="mt-2 font-label text-sm">Advanced control options go here.</p>
          </div>
        </div>
      )}

      {tab === 'kb' && (
        <div className="flex flex-1 items-center justify-center text-center text-outline">
          <div>
            <span className="material-symbols-outlined text-5xl">library_books</span>
            <p className="mt-2 font-label text-sm">Knowledge base search (coming soon).</p>
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
