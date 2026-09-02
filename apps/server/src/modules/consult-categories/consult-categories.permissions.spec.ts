import { MENU_KEYS, defaultPermissionFlags } from '../../common/menu-permission.service';
import { CONSULT_CATEGORIES_MENU_KEY } from './consult-categories.constants';

describe('상담분류 메뉴 권한 기본값', () => {
  it('메뉴 키가 서버 진실원에 등록돼 있다', () => {
    expect(MENU_KEYS as unknown as string[]).toContain(CONSULT_CATEGORIES_MENU_KEY);
  });

  it.each(['supervisor', 'admin'])('%s 는 조회와 CRUD 가 가능하다', (role) => {
    const flags = defaultPermissionFlags(role, CONSULT_CATEGORIES_MENU_KEY);
    expect(flags.canView).toBe(true);
    expect(flags.canCreate).toBe(true);
    expect(flags.canUpdate).toBe(true);
    expect(flags.canDelete).toBe(true);
  });

  it('agent 는 아무 권한도 없다', () => {
    const flags = defaultPermissionFlags('agent', CONSULT_CATEGORIES_MENU_KEY);
    expect(Object.values(flags).every((allowed) => allowed === false)).toBe(true);
  });
});
