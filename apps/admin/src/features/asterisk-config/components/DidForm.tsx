import { Form, Input, Modal, notification, Radio, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { getIvrMenus } from '../api/asteriskConfigApi';
import type { AsteriskDid, AsteriskIvrMenu } from '../types/asterisk-config';

interface Props {
  open: boolean;
  initial?: AsteriskDid | null;
  onOk: (values: Omit<AsteriskDid, 'id'>) => void;
  onCancel: () => void;
}

export function DidForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState<'ivr' | 'queue'>('ivr');
  const [menus, setMenus] = useState<AsteriskIvrMenu[]>([]);

  useEffect(() => {
    if (!open) return;
    getIvrMenus().then(setMenus).catch(() => {
      notification.warning({ message: 'IVR 메뉴 목록을 불러오지 못했습니다' });
    });
    const m = initial?.ivrMenuId ? 'ivr' : 'queue';
    setMode(m);
    form.setFieldsValue({ ...initial, _mode: m, enabled: initial?.enabled ?? true });
  }, [open, initial, form]);

  const handleOk = async () => {
    const vals = await form.validateFields();
    const result: Omit<AsteriskDid, 'id'> = {
      did: vals.did,
      representativeNumber: vals.representativeNumber ?? null,
      description: vals.description ?? null,
      ivrMenuId: vals._mode === 'ivr' ? vals.ivrMenuId : null,
      directQueue: vals._mode === 'queue' ? vals.directQueue : null,
      enabled: vals.enabled ?? true,
    };
    onOk(result);
  };

  return (
    <Modal title={initial ? 'DID 수정' : 'DID 추가'} open={open} onOk={handleOk} onCancel={onCancel} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="did" label="착신번호 (DID)" rules={[{ required: true }]}>
          <Input placeholder="07012345678" />
        </Form.Item>
        <Form.Item name="representativeNumber" label="대표번호">
          <Input placeholder="1577-1577" />
        </Form.Item>
        <Form.Item name="description" label="설명">
          <Input />
        </Form.Item>
        <Form.Item name="_mode" label="연결 방식">
          <Radio.Group onChange={e => setMode(e.target.value)}>
            <Radio value="ivr">IVR 메뉴 연결</Radio>
            <Radio value="queue">큐 직결</Radio>
          </Radio.Group>
        </Form.Item>
        {mode === 'ivr' && (
          <Form.Item name="ivrMenuId" label="IVR 메뉴" rules={[{ required: true }]}>
            <Select options={menus.map(m => ({ value: m.id, label: m.name }))} placeholder="메뉴 선택" />
          </Form.Item>
        )}
        {mode === 'queue' && (
          <Form.Item name="directQueue" label="큐 이름" rules={[{ required: true }]}>
            <Input placeholder="sales" />
          </Form.Item>
        )}
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
