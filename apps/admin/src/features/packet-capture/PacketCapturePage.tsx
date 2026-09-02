import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { usePermissionStore } from '../../store/usePermissionStore';
import {
  describeJobStatus,
  evaluateCaptureReadiness,
  formatFileSize,
  type PacketCaptureSettings,
} from './captureReadiness';

interface CaptureJob {
  packetCaptureJobId: string;
  status: string;
  interfaceName: string;
  captureFilter: string;
  durationSeconds: number;
  startedAt: string;
  endedAt: string | null;
  fileSizeBytes: string | number | null;
  packetCount: number | null;
  encryptionStatus: string;
  failureReason: string | null;
}

interface StartFormValue {
  interfaceName: string;
  captureFilter?: string;
  durationSeconds: number;
}

const POLL_INTERVAL_MS = 5000;

export function PacketCapturePage() {
  const [form] = Form.useForm<StartFormValue>();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [settings, setSettings] = useState<PacketCaptureSettings | null>(null);
  const [jobs, setJobs] = useState<CaptureJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const permission = usePermissionStore((s) => s.permissionsByMenu['system/packet-capture']);
  const canOperate = permission?.canOperate ?? false;
  const canExport = permission?.canExport ?? false;

  const readiness = evaluateCaptureReadiness(settings);
  const hasRunningJob = jobs.some((job) => job.status === 'RUNNING');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, jobsRes] = await Promise.all([
        apiClient.get('/admin/packet-captures/settings'),
        apiClient.get('/admin/packet-captures'),
      ]);
      setSettings(settingsRes.data?.data ?? null);
      setJobs(jobsRes.data?.data ?? []);
    } catch {
      messageApi.error('패킷 캡처 설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    void load();
  }, [load]);

  // 캡처가 도는 동안만 폴링한다. 끝나면 멈춘다.
  useEffect(() => {
    if (hasRunningJob && !pollTimer.current) {
      pollTimer.current = setInterval(() => void load(), POLL_INTERVAL_MS);
    }
    if (!hasRunningJob && pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [hasRunningJob, load]);

  useEffect(() => {
    if (settings) {
      form.setFieldsValue({
        interfaceName: settings.defaultInterface,
        durationSeconds: Math.min(60, settings.maxDurationSeconds),
      });
    }
  }, [settings, form]);

  const toggleEnabled = async (enabled: boolean) => {
    try {
      const res = await apiClient.patch('/admin/packet-captures/settings', { enabled });
      setSettings(res.data?.data ?? null);
      messageApi.success(enabled ? '패킷 캡처를 켰습니다.' : '패킷 캡처를 껐습니다.');
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error?.message ?? '설정을 바꾸지 못했습니다.');
    }
  };

  const startCapture = async (value: StartFormValue) => {
    setStarting(true);
    try {
      await apiClient.post('/admin/packet-captures', value);
      messageApi.success(`${value.durationSeconds}초 캡처를 시작했습니다.`);
      await load();
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error?.message ?? '캡처를 시작하지 못했습니다.');
    } finally {
      setStarting(false);
    }
  };

  const stopCapture = async (job: CaptureJob) => {
    try {
      await apiClient.post(`/admin/packet-captures/${job.packetCaptureJobId}/stop`);
      messageApi.success('캡처를 중지했습니다.');
      await load();
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error?.message ?? '캡처를 중지하지 못했습니다.');
    }
  };

  const downloadCapture = async (job: CaptureJob) => {
    setDownloadingId(job.packetCaptureJobId);
    try {
      const res = await apiClient.get(
        `/admin/packet-captures/${job.packetCaptureJobId}/download`,
        { responseType: 'blob' },
      );
      const blob =
        res.data instanceof Blob
          ? res.data
          : new Blob([res.data], { type: res.headers['content-type'] as string | undefined });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${job.packetCaptureJobId}.pcap`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      messageApi.error('캡처 파일을 다운로드할 수 없습니다.');
    } finally {
      setDownloadingId((current) => (current === job.packetCaptureJobId ? null : current));
    }
  };

  const columns = [
    {
      title: '상태',
      dataIndex: 'status',
      render: (status: string) => {
        const meta = describeJobStatus(status);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    { title: '인터페이스', dataIndex: 'interfaceName' },
    {
      title: '필터',
      dataIndex: 'captureFilter',
      render: (filter: string) => filter || <Typography.Text type="secondary">전량</Typography.Text>,
    },
    { title: '시간(초)', dataIndex: 'durationSeconds' },
    {
      title: '시작',
      dataIndex: 'startedAt',
      render: (value: string) => new Date(value).toLocaleString('ko-KR'),
    },
    { title: '크기', dataIndex: 'fileSizeBytes', render: formatFileSize },
    {
      title: '패킷',
      dataIndex: 'packetCount',
      render: (value: number | null) => value ?? '-',
    },
    {
      title: '암호화',
      dataIndex: 'encryptionStatus',
      render: (value: string) =>
        value === 'ENCRYPTED' ? <Tag color="success">암호화</Tag> : <Tag>평문</Tag>,
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, job: CaptureJob) => (
        <Space>
          {job.status === 'RUNNING' && canOperate && (
            <Popconfirm title="캡처를 중지할까요?" onConfirm={() => stopCapture(job)}>
              <Button size="small" danger>중지</Button>
            </Popconfirm>
          )}
          {job.status === 'COMPLETED' && canExport && (
            <Button
              size="small"
              loading={downloadingId === job.packetCaptureJobId}
              onClick={() => downloadCapture(job)}
            >
              다운로드
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {messageContextHolder}

      <Card
        title="패킷 캡처"
        extra={
          <Space>
            <Typography.Text type="secondary">
              {settings ? `노드 ${settings.nodeId} · 보존 ${settings.retentionDays}일` : ''}
            </Typography.Text>
            <Switch
              checked={settings?.enabled ?? false}
              disabled={!canOperate || !settings?.hardEnabled}
              onChange={toggleEnabled}
              checkedChildren="켬"
              unCheckedChildren="끔"
            />
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          통화 문제를 진단할 때 PBX 의 SIP·RTP 패킷을 정해진 시간 동안만 저장합니다.
          <strong> 저장된 파일에는 실제 통화 음성이 들어 있습니다.</strong>
        </Typography.Paragraph>

        {readiness.blockers.map((reason) => (
          <Alert key={reason} type="warning" showIcon message={reason} style={{ marginBottom: 8 }} />
        ))}
        {readiness.warnings.map((reason) => (
          <Alert key={reason} type="info" showIcon message={reason} style={{ marginBottom: 8 }} />
        ))}
        {!canOperate && (
          <Alert type="info" showIcon message="캡처를 시작할 권한이 없습니다. 조회만 가능합니다." />
        )}
      </Card>

      <Card title="캡처 시작">
        <Form form={form} layout="inline" onFinish={startCapture} disabled={!canOperate}>
          <Form.Item name="interfaceName" label="인터페이스" rules={[{ required: true }]}>
            <Select
              style={{ minWidth: 160 }}
              options={(settings?.interfaces ?? []).map((name) => ({ value: name, label: name }))}
            />
          </Form.Item>
          <Form.Item
            name="captureFilter"
            label="필터"
            tooltip="BPF 표현식. 비우면 전량 캡처. 예: udp and portrange 10000-20000"
          >
            <Input style={{ minWidth: 320 }} placeholder="host 27.255.98.132 or port 36070" />
          </Form.Item>
          <Form.Item name="durationSeconds" label="시간(초)" rules={[{ required: true }]}>
            <InputNumber min={5} max={settings?.maxDurationSeconds ?? 600} />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={starting}
              disabled={!readiness.ready || hasRunningJob}
            >
              {hasRunningJob ? '캡처 중' : '시작'}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="캡처 이력">
        <Table
          rowKey="packetCaptureJobId"
          size="small"
          loading={loading}
          dataSource={jobs}
          columns={columns}
          pagination={{ pageSize: 20 }}
          expandable={{
            rowExpandable: (job) => Boolean(job.failureReason),
            expandedRowRender: (job) => (
              <Typography.Text type="danger">{job.failureReason}</Typography.Text>
            ),
          }}
        />
      </Card>
    </Space>
  );
}
