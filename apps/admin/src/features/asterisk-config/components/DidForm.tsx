import { Form, Input, Modal, notification, Radio, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { getIvrMenus } from '../api/asteriskConfigApi';
import type { AsteriskDid, AsteriskIvrMenu, DistributionRuleOption } from '../types/asterisk-config';
import { apiClient } from '../../../shared/lib/apiClient';

interface Props {
  open: boolean;
  initial?: AsteriskDid | null;
  onOk: (values: Omit<AsteriskDid, 'id'>) => void;
  onCancel: () => void;
}

interface AgentOption {
  agentId: string;
  agentName: string;
  extension: string;
  isActive?: boolean;
}

export function DidForm({ open, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();
  const [mode, setMode] = useState<'ivr' | 'queue' | 'extension'>('ivr');
  const [menus, setMenus] = useState<AsteriskIvrMenu[]>([]);
  const [rules, setRules] = useState<DistributionRuleOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      getIvrMenus(),
      apiClient.get('/queues'),
      apiClient.get('/agents'),
    ]).then(([menuRows, queueRes, agentRes]) => {
      setMenus(menuRows);
      setRules(queueRes.data?.data ?? []);
      setAgents((agentRes.data?.data ?? []).filter((agent: AgentOption) => agent.isActive !== false));
      const m = initial?.ivrMenuId ? 'ivr' : initial?.directExtension ? 'extension' : 'queue';
      const defaultRule = (queueRes.data?.data ?? []).find((item: DistributionRuleOption) => item.isDefaultRule);
      setMode(m);
      form.setFieldsValue({
        ...initial,
        _mode: m,
        directQueue: initial?.directQueue ?? defaultRule?.queueName ?? undefined,
        directExtension: initial?.directExtension ?? undefined,
        enabled: initial?.enabled ?? true,
      });
    }).catch(() => {
      notification.warning({ message: 'IVR 메뉴, 호 분배룰 또는 상담원 목록을 불러오지 못했습니다' });
    });
  }, [open, initial, form]);

  const handleOk = async () => {
    const vals = await form.validateFields();
    const result: Omit<AsteriskDid, 'id'> = {
      did: vals.did,
      representativeNumber: vals.representativeNumber ?? null,
      description: vals.description ?? null,
      ivrMenuId: vals._mode === 'ivr' ? vals.ivrMenuId : null,
      directQueue: vals._mode === 'queue' ? vals.directQueue : null,
      directExtension: vals._mode === 'extension' ? vals.directExtension : null,
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
            <Radio value="extension">내선 직결</Radio>
          </Radio.Group>
        </Form.Item>
        {mode === 'ivr' && (
          <Form.Item name="ivrMenuId" label="IVR 메뉴" rules={[{ required: true }]}>
            <Select options={menus.map(m => ({ value: m.id, label: m.name }))} placeholder="메뉴 선택" />
          </Form.Item>
        )}
        {mode === 'queue' && (
          <Form.Item name="directQueue" label="호 분배룰">
            <Select
              allowClear
              options={rules.map((rule) => ({
                value: rule.queueName,
                label: rule.isDefaultRule
                  ? `${rule.queueDisplayName ?? rule.queueName} (기본)`
                  : rule.queueDisplayName ?? rule.queueName,
              }))}
              placeholder="미선택 시 기본 호 분배룰"
            />
          </Form.Item>
        )}
        {mode === 'extension' && (
          <Form.Item name="directExtension" label="직접 착신 내선" rules={[{ required: true, message: '직접 착신할 내선을 선택하세요.' }]}>
            <Select
              showSearch
              options={agents.map((agent) => ({
                value: agent.extension,
                label: `${agent.extension} · ${agent.agentName}`,
              }))}
              placeholder="내선 선택"
              optionFilterProp="label"
            />
          </Form.Item>
        )}
        <Form.Item name="enabled" label="활성" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
