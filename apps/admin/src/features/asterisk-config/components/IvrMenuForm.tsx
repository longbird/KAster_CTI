import { Button, Form, Input, InputNumber, Modal, Space, Table } from 'antd';
import { useEffect, useState } from 'react';
import type { AsteriskIvrEntry, AsteriskIvrMenu } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskIvrMenu | null;
  onOk: (values: Omit<AsteriskIvrMenu, 'id'>) => void;
  onCancel: () => void;
}

export function IvrMenuForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();
  const [entries, setEntries] = useState<AsteriskIvrEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(initial ?? { timeoutSecs: 5 });
    setEntries(initial?.entries.map(e => ({ digit: e.digit, label: e.label, queueName: e.queueName })) ?? []);
  }, [open, initial, form]);

  const addEntry = () => setEntries(prev => [...prev, { digit: '', label: '', queueName: '' }]);
  const updateEntry = (i: number, field: keyof AsteriskIvrEntry, value: string) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  const removeEntry = (i: number) => setEntries(prev => prev.filter((_, idx) => idx !== i));

  const handleOk = async () => {
    const vals = await form.validateFields();
    onOk({ ...vals, entries });
  };

  const entryCols = [
    {
      title: 'DTMF 키', dataIndex: 'digit', width: 90,
      render: (v: string, _: AsteriskIvrEntry, i: number) =>
        <Input value={v} onChange={e => updateEntry(i, 'digit', e.target.value)} style={{ width: 60 }} maxLength={1} />,
    },
    {
      title: '표시명', dataIndex: 'label',
      render: (v: string, _: AsteriskIvrEntry, i: number) =>
        <Input value={v} onChange={e => updateEntry(i, 'label', e.target.value)} />,
    },
    {
      title: '큐 이름', dataIndex: 'queueName',
      render: (v: string, _: AsteriskIvrEntry, i: number) =>
        <Input value={v} onChange={e => updateEntry(i, 'queueName', e.target.value)} placeholder="sales" />,
    },
    {
      title: '', width: 60,
      render: (_: unknown, __: AsteriskIvrEntry, i: number) =>
        <Button size="small" danger onClick={() => removeEntry(i)}>삭제</Button>,
    },
  ];

  return (
    <Modal
      title={initial ? 'IVR 메뉴 수정' : 'IVR 메뉴 추가'}
      open={open} onOk={handleOk} onCancel={onCancel} width={640} destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="메뉴 이름" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="welcomePrompt" label="안내 멘트 파일명">
          <Input placeholder="custom/welcome" />
        </Form.Item>
        <Form.Item name="menuPrompt" label="메뉴 멘트 파일명">
          <Input placeholder="custom/main_menu" />
        </Form.Item>
        <Form.Item name="timeoutSecs" label="키 입력 대기(초)">
          <InputNumber min={1} max={30} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
      <Space style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 500 }}>메뉴 항목 (DTMF → 큐)</span>
        <Button size="small" onClick={addEntry}>+ 항목 추가</Button>
      </Space>
      <Table
        size="small"
        dataSource={entries}
        columns={entryCols}
        rowKey={(_, i) => String(i)}
        pagination={false}
      />
    </Modal>
  );
}
