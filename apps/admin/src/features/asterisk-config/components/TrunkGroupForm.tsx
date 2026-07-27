import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect } from 'react';
import type { AsteriskTrunk, AsteriskTrunkGroup, AsteriskTrunkGroupInput } from '../types/asterisk-config';

interface Props {
  open: boolean;
  trunks: AsteriskTrunk[];
  initial?: AsteriskTrunkGroup | null;
  onOk: (values: AsteriskTrunkGroupInput) => void;
  onCancel: () => void;
}

export function TrunkGroupForm({ open, trunks, initial, onOk, onCancel }: Props) {
  const [form] = Form.useForm();

  const trunkOptions = trunks.map((trunk) => ({
    value: trunk.id,
    label: `${trunk.name}${trunk.enabled ? '' : ' (비활성)'}`,
  }));

  const handleSubmit = async () => {
    const values = await form.validateFields();
    onOk({
      name: values.name,
      description: values.description || null,
      strategy: 'PRIORITY',
      isDefault: values.isDefault ?? false,
      enabled: values.enabled ?? true,
      members: (values.members ?? []).map((member: { trunkId: string; priority?: number; enabled?: boolean }, index: number) => ({
        trunkId: member.trunkId,
        priority: member.priority ?? (index + 1) * 100,
        enabled: member.enabled ?? true,
      })),
    });
  };

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      initial
        ? {
            name: initial.name,
            description: initial.description,
            isDefault: initial.isDefault,
            enabled: initial.enabled,
            members: initial.members.map((member) => ({
              trunkId: member.trunkId,
              priority: member.priority,
              enabled: member.enabled,
            })),
          }
        : {
            strategy: 'PRIORITY',
            isDefault: false,
            enabled: true,
            members: [{ priority: 100, enabled: true }],
          },
    );
  }, [form, initial, open]);

  return (
    <Modal
      title={initial ? '국선 그룹 수정' : '국선 그룹 추가'}
      open={open}
      onOk={() => void handleSubmit()}
      onCancel={onCancel}
      destroyOnClose
      width={720}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="그룹명" rules={[{ required: true, message: '그룹명을 입력하세요.' }]}>
          <Input placeholder="대표 발신 그룹" />
        </Form.Item>
        <Form.Item name="description" label="설명">
          <Input placeholder="장애 우회 또는 업무별 회선 풀 설명" />
        </Form.Item>
        <Space size={24} wrap>
          <Form.Item name="isDefault" label="기본 발신 그룹" valuePropName="checked">
            <Switch checkedChildren="기본" unCheckedChildren="일반" />
          </Form.Item>
          <Form.Item name="enabled" label="활성" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>

        <Form.List
          name="members"
          rules={[
            {
              validator: async (_, members) => {
                if (!members || members.length < 1) {
                  throw new Error('국선 그룹에는 최소 1개 회선이 필요합니다.');
                }
                const trunkIds = members.map((member: { trunkId?: string }) => member?.trunkId).filter(Boolean);
                if (new Set(trunkIds).size !== trunkIds.length) {
                  throw new Error('같은 회선을 중복으로 추가할 수 없습니다.');
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {fields.map((field) => (
                <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'trunkId']}
                    rules={[{ required: true, message: '회선을 선택하세요.' }]}
                    style={{ width: 320 }}
                  >
                    <Select placeholder="회선 선택" options={trunkOptions} />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'priority']} style={{ width: 130 }}>
                    <InputNumber min={1} max={9999} placeholder="우선순위" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'enabled']} valuePropName="checked">
                    <Switch checkedChildren="사용" unCheckedChildren="중지" />
                  </Form.Item>
                  <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                </Space>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ priority: (fields.length + 1) * 100, enabled: true })}>
                회선 추가
              </Button>
              <Form.ErrorList errors={errors} />
            </Space>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
