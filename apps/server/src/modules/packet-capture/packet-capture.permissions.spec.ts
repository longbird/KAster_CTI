import { MENU_KEYS, defaultPermissionFlags } from '../../common/menu-permission.service';
import { PACKET_CAPTURE_MENU_KEY } from './packet-capture.constants';

describe('패킷 캡처 메뉴 권한 기본값', () => {
  it('메뉴 키가 서버 진실원에 등록돼 있다', () => {
    expect(MENU_KEYS as unknown as string[]).toContain(PACKET_CAPTURE_MENU_KEY);
  });

  it.each(['supervisor', 'admin'])('%s 는 조회와 조작(시작/중지)이 가능하다', (role) => {
    const flags = defaultPermissionFlags(role, PACKET_CAPTURE_MENU_KEY);
    expect(flags.canView).toBe(true);
    expect(flags.canOperate).toBe(true);
  });

  // pcap 에는 통화 음성(RTP)이 담긴다. 기본으로는 아무 역할도 내려받을 수 없어야 하고,
  // 필요하면 관리자가 `설정 > 권한` 에서 명시적으로 켜야 한다.
  it.each(['supervisor', 'admin'])('%s 도 기본적으로는 다운로드(export)할 수 없다', (role) => {
    expect(defaultPermissionFlags(role, PACKET_CAPTURE_MENU_KEY).canExport).toBe(false);
  });

  it('생성/수정/삭제 권한은 부여하지 않는다', () => {
    const flags = defaultPermissionFlags('admin', PACKET_CAPTURE_MENU_KEY);
    expect(flags.canCreate).toBe(false);
    expect(flags.canUpdate).toBe(false);
    expect(flags.canDelete).toBe(false);
  });

  it('agent 는 아무 권한도 없다', () => {
    const flags = defaultPermissionFlags('agent', PACKET_CAPTURE_MENU_KEY);
    expect(Object.values(flags).every((allowed) => allowed === false)).toBe(true);
  });
});
