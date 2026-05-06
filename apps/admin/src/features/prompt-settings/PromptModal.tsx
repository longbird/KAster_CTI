import { UploadOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Form, Input, Modal, Space, Switch, Tag, Typography, Upload, message } from 'antd';
import type { RcFile, UploadRequestOption as RcCustomRequestOptions } from 'rc-upload/lib/interface';
import { useEffect, useState } from 'react';
import type { AsteriskPrompt } from '../asterisk-config/types/asterisk-config';
import { uploadPromptAudio } from '../asterisk-config/api/asteriskConfigApi';

export type PromptFormValue = Omit<AsteriskPrompt, 'id'>;

interface Props {
  open: boolean;
  prompt?: AsteriskPrompt | null;
  onClose: () => void;
  onSave: (values: PromptFormValue) => Promise<void>;
}

const CATEGORY_SUGGESTIONS = [
  { value: 'ivr' },
  { value: 'queue' },
  { value: 'common' },
];

function buildPromptFormValues(prompt?: AsteriskPrompt | null): PromptFormValue {
  return {
    promptKey: prompt?.promptKey ?? '',
    displayName: prompt?.displayName ?? '',
    fileName: prompt?.fileName ?? '',
    category: prompt?.category ?? 'ivr',
    description: prompt?.description ?? null,
    isActive: prompt?.isActive ?? true,
  };
}

export function PromptModal({ open, prompt, onClose, onSave }: Props) {
  const [form] = Form.useForm<PromptFormValue>();
  const [uploading, setUploading] = useState(false);
  const fileName = Form.useWatch('fileName', form);
  const promptKey = Form.useWatch('promptKey', form);

  useEffect(() => {
    if (!open) {
      return;
    }

    setUploading(false);
    const nextValues = buildPromptFormValues(prompt);
    form.setFieldsValue(nextValues);
  }, [open, prompt?.id, form, prompt]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSave(values);
    form.resetFields();
  };

  const handleUpload = async (options: RcCustomRequestOptions) => {
    const file = options.file as File;
    setUploading(true);
    try {
      const uploaded = await uploadPromptAudio(file);
      form.setFieldValue('fileName', uploaded.fileName);
      const currentPromptKey = form.getFieldValue('promptKey') as string | undefined;
      if (!currentPromptKey?.trim()) {
        form.setFieldValue('promptKey', uploaded.promptKey);
      }
      options.onSuccess?.(uploaded);
      message.success('음성 파일을 업로드했습니다.');
    } catch (error: any) {
      options.onError?.(error);
      message.error(error?.response?.data?.error?.message ?? '음성 파일 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const beforeUpload = (file: RcFile) => {
    const fileName = file.name.toLowerCase();
    const isAllowed = ['.wav', '.mp3', '.gsm', '.ulaw', '.alaw'].some((ext) => fileName.endsWith(ext));
    if (!isAllowed) {
      message.error('wav, mp3, gsm, ulaw, alaw 파일만 업로드할 수 있습니다.');
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  return (
    <Modal
      title={null}
      open={open}
      onOk={() => void handleOk()}
      onCancel={onClose}
      width={720}
      okText="저장"
      cancelText="취소"
      confirmLoading={uploading}
      className="prompt-modal"
      forceRender
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={buildPromptFormValues(prompt)}
      >
        <div className="prompt-modal__header">
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {prompt ? '멘트 수정' : '새 멘트 등록'}
            </Typography.Title>
            <Typography.Text type="secondary">
              음성 파일과 Playback 정보를 한 번에 등록합니다.
            </Typography.Text>
          </div>
        </div>

        <div className="prompt-modal__panel prompt-modal__upload-panel">
          <div className="prompt-modal__panel-head">
            <div>
              <Typography.Text className="prompt-modal__section-label">음성 파일</Typography.Text>
              <Typography.Title level={5} style={{ margin: '4px 0 0' }}>
                파일 업로드
              </Typography.Title>
            </div>
            {fileName ? <Tag>{fileName}</Tag> : null}
          </div>

          <div className="prompt-modal__upload-card">
            <div className="prompt-modal__upload-copy">
              <Typography.Text strong>`.wav`, `.mp3`, `.gsm`, `.ulaw`, `.alaw`</Typography.Text>
              <Typography.Text type="secondary">
                업로드하면 파일명이 자동으로 입력되고, 프롬프트 키가 비어 있으면 기본값도 같이 제안됩니다.
              </Typography.Text>
            </div>
            <Upload
              showUploadList={false}
              customRequest={(options) => void handleUpload(options)}
              beforeUpload={beforeUpload}
            >
              <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
                파일 업로드
              </Button>
            </Upload>
          </div>

          <Form.Item
            name="fileName"
            label="파일명"
            rules={[{ required: true, message: '파일명을 입력하세요.' }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="welcome.wav" />
          </Form.Item>
        </div>

        <div className="prompt-modal__grid">
          <div className="prompt-modal__panel">
            <Typography.Text className="prompt-modal__section-label">기본 정보</Typography.Text>

            <Form.Item
              name="displayName"
              label="멘트명"
              rules={[{ required: true, message: '멘트명을 입력하세요.' }]}
            >
              <Input placeholder="대표 환영 멘트" />
            </Form.Item>

            <Form.Item
              name="category"
              label="분류"
              initialValue="ivr"
              style={{ marginBottom: 0 }}
            >
              <AutoComplete
                options={CATEGORY_SUGGESTIONS}
                placeholder="ivr"
                filterOption={(inputValue, option) =>
                  (option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())
                }
              />
            </Form.Item>
          </div>

          <div className="prompt-modal__panel">
            <Typography.Text className="prompt-modal__section-label">Playback</Typography.Text>

            <Form.Item
              name="promptKey"
              label="프롬프트 키"
              rules={[
                { required: true, message: '프롬프트 키를 입력하세요.' },
                { pattern: /^[A-Za-z0-9_/-]+$/, message: '영문, 숫자, _, /, - 만 허용됩니다.' },
              ]}
            >
              <Input placeholder="custom/welcome" />
            </Form.Item>

            <div className="prompt-modal__hint">
              <Typography.Text type="secondary">
                PBX에서 `Playback({promptKey?.trim() || 'custom/welcome'})`처럼 호출하는 값입니다.
              </Typography.Text>
            </div>
          </div>
        </div>

        <div className="prompt-modal__panel">
          <div className="prompt-modal__panel-row">
            <Typography.Text className="prompt-modal__section-label">추가 옵션</Typography.Text>
            <Space size={10}>
              <Typography.Text type="secondary">상태</Typography.Text>
              <Form.Item name="isActive" valuePropName="checked" noStyle>
                <Switch checkedChildren="활성" unCheckedChildren="비활성" />
              </Form.Item>
            </Space>
          </div>

          <Form.Item name="description" label="설명" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} placeholder="필요한 경우에만 메모를 남기세요." />
          </Form.Item>
        </div>

        <div className="prompt-modal__footer-note">
          <Space size={8} wrap>
            <Tag bordered={false} color="blue">
              Playback
            </Tag>
            <Typography.Text type="secondary">
              IVR 메뉴에서는 활성 멘트만 선택할 수 있습니다.
            </Typography.Text>
          </Space>
        </div>
      </Form>
    </Modal>
  );
}
