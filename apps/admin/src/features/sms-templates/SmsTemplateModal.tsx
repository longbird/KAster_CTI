import { Alert, Card, Col, Form, Input, Modal, Row, Select, Space, Switch, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { SmsTemplateInput, SmsTemplateRow } from './types/smsTemplate';
import { SMS_TEMPLATE_CATEGORY_OPTIONS } from './types/smsTemplate';

const TOKEN_SAMPLES: Array<{ token: string; sample: string; description: string }> = [
  { token: '{고객명}', sample: '홍길동', description: '고객 이름' },
  { token: '{고객전화번호}', sample: '01012345678', description: '고객 연락처' },
  { token: '{지사명}', sample: '강남지사', description: '발송 지사명' },
  { token: '{대표번호}', sample: '07052346380', description: '대표 발신 번호' },
  { token: '{수신거부번호}', sample: '0801234567', description: '080 수신거부 번호' },
  { token: '{상담원명}', sample: '김상담', description: '처리 담당 상담원' },
  { token: '{현재일시}', sample: '2026-04-22 14:30', description: '메시지 생성 시각' },
];

function renderPreview(content: string) {
  return TOKEN_SAMPLES.reduce((result, { token, sample }) => result.split(token).join(sample), content);
}

function countDomesticMessageBytes(content: string) {
  const normalized = content.replace(/\r?\n/g, '\r\n');
  let total = 0;

  for (const character of normalized) {
    total += character.charCodeAt(0) <= 0x7f ? 1 : 2;
  }

  return total;
}

function estimateSmsType(byteLength: number) {
  if (byteLength === 0) {
    return { label: '미입력', color: 'default' as const };
  }

  if (byteLength <= 90) {
    return { label: 'SMS 예상', color: 'success' as const };
  }

  return { label: 'LMS 예상', color: 'warning' as const };
}

interface SmsTemplateModalProps {
  open: boolean;
  template?: SmsTemplateRow | null;
  onClose: () => void;
  onSave: (values: SmsTemplateInput) => Promise<void>;
}

export function SmsTemplateModal({ open, template, onClose, onSave }: SmsTemplateModalProps) {
  const [form] = Form.useForm<SmsTemplateInput>();
  const [submitting, setSubmitting] = useState(false);
  const content = Form.useWatch('content', form) ?? '';

  useEffect(() => {
    if (!open) {
      return;
    }

    if (template) {
      form.setFieldsValue({
        templateName: template.templateName,
        category: template.category,
        content: template.content,
        isActive: template.isActive,
      });
      return;
    }

    form.resetFields();
    form.setFieldsValue({
      category: 'GENERAL_NOTICE',
      content: '',
      isActive: true,
      templateName: '',
    });
  }, [form, open, template]);

  const preview = useMemo(() => renderPreview(content), [content]);
  const messageBytes = useMemo(() => countDomesticMessageBytes(content), [content]);
  const messageStats = useMemo(
    () => ({
      characterCount: content.length,
      byteLength: messageBytes,
      smsType: estimateSmsType(messageBytes),
    }),
    [content, messageBytes],
  );

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await onSave(values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={template ? '문자 템플릿 수정' : '문자 템플릿 등록'}
      open={open}
      onOk={() => void handleSubmit()}
      onCancel={onClose}
      okText={template ? '저장' : '등록'}
      cancelText="취소"
      width={1080}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ category: 'GENERAL_NOTICE', isActive: true, templateName: '', content: '' }}
          >
            <Form.Item
              label="템플릿 이름"
              name="templateName"
              rules={[
                { required: true, message: '템플릿 이름을 입력하세요.' },
                {
                  validator: (_, value: string | undefined) =>
                    value?.trim()
                      ? Promise.resolve()
                      : Promise.reject(new Error('템플릿 이름을 입력하세요.')),
                },
              ]}
            >
              <Input maxLength={120} placeholder="예: 080 수신거부 기본 안내" />
            </Form.Item>

            <Form.Item label="카테고리" name="category" rules={[{ required: true, message: '카테고리를 선택하세요.' }]}>
              <Select options={SMS_TEMPLATE_CATEGORY_OPTIONS} />
            </Form.Item>

            <Form.Item
              label="문자 내용"
              name="content"
              rules={[
                { required: true, message: '문자 내용을 입력하세요.' },
                {
                  validator: (_, value: string | undefined) =>
                    value?.trim()
                      ? Promise.resolve()
                      : Promise.reject(new Error('문자 내용을 입력하세요.')),
                },
              ]}
              extra="토큰은 저장 시 그대로 보관되고, 우측 미리보기에서만 샘플 데이터로 치환됩니다."
            >
              <Input.TextArea
                rows={12}
                showCount
                maxLength={2000}
                placeholder="{고객명}님, {지사명} 안내입니다. 문의는 {대표번호}로 연락 부탁드립니다."
              />
            </Form.Item>

            <Form.Item label="활성 상태" name="isActive" valuePropName="checked">
              <Switch checkedChildren="활성" unCheckedChildren="비활성" />
            </Form.Item>
          </Form>
        </Col>

        <Col xs={24} lg={12}>
          <Space direction="vertical" size={12} style={{ display: 'flex' }}>
            <Alert
              type="info"
              showIcon
              message="샘플 데이터 기반 미리보기"
              description="실제 발송 시 값은 서버 데이터로 치환됩니다. 문자 길이는 국내 SMS 관행 기준으로 영문 1byte, 한글 2byte로 추정합니다."
            />

            <Card size="small" title="사용 가능한 토큰">
              <Space size={[8, 8]} wrap>
                {TOKEN_SAMPLES.map(({ token, description, sample }) => (
                  <Tag key={token} style={{ paddingInline: 10, paddingBlock: 6 }}>
                    <Space size={6}>
                      <Typography.Text code>{token}</Typography.Text>
                      <Typography.Text type="secondary">{description}</Typography.Text>
                      <Typography.Text type="secondary">예: {sample}</Typography.Text>
                    </Space>
                  </Tag>
                ))}
              </Space>
            </Card>

            <Card size="small" title="미리보기">
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', minHeight: 140, marginBottom: 0 }}>
                {preview || '미리보기 내용이 여기에 표시됩니다.'}
              </Typography.Paragraph>
            </Card>

            <Card size="small" title="문자 길이 예상">
              <Space wrap size={[8, 8]}>
                <Tag>{messageStats.characterCount}자</Tag>
                <Tag>{messageStats.byteLength}byte</Tag>
                <Tag color={messageStats.smsType.color}>{messageStats.smsType.label}</Tag>
                <Typography.Text type="secondary">국내 기준 90byte 이하는 SMS, 초과 시 LMS로 예상합니다.</Typography.Text>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </Modal>
  );
}
