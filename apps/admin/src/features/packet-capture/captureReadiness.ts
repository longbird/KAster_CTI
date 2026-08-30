export interface PacketCaptureSettings {
  enabled: boolean;
  hardEnabled: boolean;
  dumpcapAvailable: boolean;
  isLeaderNode: boolean;
  encryptionEnabled: boolean;
  interfaces: string[];
  defaultInterface: string;
  maxDurationSeconds: number;
  retentionDays: number;
  nodeId: string;
}

export interface CaptureReadiness {
  /** 지금 캡처를 시작할 수 있는가 */
  ready: boolean;
  /** 시작을 막는 조건. 하나라도 있으면 시작 버튼을 잠근다. */
  blockers: string[];
  /** 시작은 되지만 알고 있어야 하는 것 */
  warnings: string[];
}

/**
 * 서버가 준 설정으로 "지금 캡처가 가능한가" 와 그 이유를 만든다.
 *
 * 막힌 이유를 화면에 그대로 보여주는 게 목적이다. 버튼만 잠가두면
 * 운영자가 왜 안 되는지 알 수 없어 서버 로그를 뒤지게 된다.
 */
export function evaluateCaptureReadiness(
  settings: PacketCaptureSettings | null,
): CaptureReadiness {
  if (!settings) {
    return { ready: false, blockers: ['설정을 불러오지 못했습니다'], warnings: [] };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!settings.hardEnabled) {
    blockers.push('서버에서 패킷 캡처가 꺼져 있습니다 (PACKET_CAPTURE_ENABLED=false). 운영자가 켜야 합니다');
  }
  if (!settings.enabled) {
    blockers.push('이 테넌트의 패킷 캡처가 꺼져 있습니다. 위 스위치로 켜주세요');
  }
  if (!settings.dumpcapAvailable) {
    blockers.push('capture-agent 에서 dumpcap 을 찾을 수 없습니다. 컨테이너와 NET_RAW 권한을 확인하세요');
  }
  if (!settings.isLeaderNode) {
    blockers.push(`이 노드(${settings.nodeId})는 리더가 아닙니다. 리더 노드에서 시작해야 합니다`);
  }
  if (!settings.interfaces.length) {
    blockers.push('캡처 가능한 인터페이스가 없습니다');
  }

  if (!settings.encryptionEnabled) {
    warnings.push(
      '녹취 암호화가 꺼져 있어 캡처 파일이 평문으로 저장됩니다 (RECORDING_ENCRYPTION_ENABLED)',
    );
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

export type CaptureJobStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'DELETED_BY_RETENTION'
  | string;

export function describeJobStatus(status: CaptureJobStatus): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'RUNNING':
      return { label: '캡처 중', color: 'processing' };
    case 'COMPLETED':
      return { label: '완료', color: 'success' };
    case 'FAILED':
      return { label: '실패', color: 'error' };
    case 'DELETED_BY_RETENTION':
      return { label: '보존기간 만료 삭제', color: 'default' };
    default:
      return { label: status, color: 'default' };
  }
}

export function formatFileSize(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined) return '-';
  const value = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(value)) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
