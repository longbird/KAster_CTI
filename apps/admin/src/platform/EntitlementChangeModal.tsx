import { Alert, Checkbox, Descriptions, Input, Modal, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { needsIrreversibleAck } from './types/entitlementView';
import type { FeatureEntitlement } from './types/platform';

export interface EntitlementChangeRequest {
  feature: FeatureEntitlement;
  nextEnabled: boolean;
}

export interface EntitlementChangeValues {
  note: string;
  acknowledgeIrreversible: boolean;
}

interface Props {
  /** null 이면 닫힌 상태. 열려 있는 동안 무엇을 어떻게 바꾸는지가 여기 다 들어 있다. */
  request: EntitlementChangeRequest | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (values: EntitlementChangeValues) => void;
}

/**
 * 자격을 바꾸기 **전에** 뜨는 확인 대화상자.
 *
 * 되돌릴 수 없는 기능은 여기서 경고를 보여주고 체크박스를 받는다. 켠 **뒤에** 알려주는 것은
 * 아무 의미가 없기 때문에, 스위치는 이 대화상자를 통과하기 전까지 움직이지 않는다.
 */
export function EntitlementChangeModal({ request, saving, onCancel, onConfirm }: Props) {
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!request) return;
    setNote('');
    setAcknowledged(false);
  }, [request]);

  if (!request) return null;

  const { feature, nextEnabled } = request;
  const requiresAck = needsIrreversibleAck(feature, nextEnabled);

  return (
    <Modal
      open
      title={nextEnabled ? '기능 자격 허용' : '기능 자격 차단'}
      okText={nextEnabled ? '허용' : '차단'}
      cancelText="취소"
      okButtonProps={{ danger: requiresAck, disabled: requiresAck && !acknowledged }}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => onConfirm({ note: note.trim(), acknowledgeIrreversible: acknowledged })}
      destroyOnClose
    >
      <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label="기능">
          {feature.name} <Typography.Text code>{feature.key}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="변경">
          <Tag>{feature.enabled ? '허용' : '차단'}</Tag>
          {'→ '}
          <Tag color={nextEnabled ? 'success' : 'default'}>{nextEnabled ? '허용' : '차단'}</Tag>
        </Descriptions.Item>
      </Descriptions>

      {requiresAck ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="한 번 켜면 되돌릴 수 없습니다"
          description={
            <>
              <div>
                {feature.name} 은(는) 켠 뒤에는 끌 수 없습니다. 켜는 순간부터 새 녹취가 암호화되고, 암호화된 파일은
                평문으로 되돌리지 않습니다.
              </div>
              <div style={{ marginTop: 8 }}>
                암호화 키를 잃어버리면 그 시점 이후의 녹취를 영구히 읽을 수 없습니다. 키 보관 방법을 먼저 확인하세요.
              </div>
              <Checkbox
                style={{ marginTop: 12 }}
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              >
                되돌릴 수 없다는 것을 이해했습니다
              </Checkbox>
            </>
          }
        />
      ) : null}

      <Typography.Text type="secondary">
        변경 사유 (선택) — 왜 바꿨는지 나중에 이력에서 읽게 됩니다.
      </Typography.Text>
      <Input.TextArea
        rows={3}
        style={{ marginTop: 6 }}
        maxLength={500}
        showCount
        value={note}
        placeholder="예: 2026-09 계약에 통화 AI 분석 포함"
        onChange={(event) => setNote(event.target.value)}
      />
    </Modal>
  );
}
