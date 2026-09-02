/**
 * 서버 MENU_KEYS 와 관리자 menuConfig 가 같은 값을 써야 한다.
 * 한쪽만 바꾸면 권한 검사가 조용히 어긋난다.
 */
export const CONSULT_CATEGORIES_MENU_KEY = 'settings/consult-categories';

/** 대분류 - 중분류 - 소분류 3단계까지만 둔다. 더 깊어지면 분류가 아니라 태그다. */
export const MAX_CATEGORY_LEVEL = 3;
