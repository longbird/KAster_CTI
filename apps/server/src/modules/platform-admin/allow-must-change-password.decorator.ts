import { SetMetadata } from '@nestjs/common';

export const ALLOW_MUST_CHANGE_PASSWORD_KEY = 'allowMustChangePassword';

/**
 * 비밀번호를 아직 바꾸지 않은 계정도 부를 수 있는 엔드포인트에 붙인다.
 *
 * 비밀번호 변경 자체와 본인 조회 둘뿐이다. 이 둘까지 막으면 초기 비밀번호를
 * 바꿀 방법이 없어 계정이 영영 잠긴다.
 */
export const AllowMustChangePassword = () => SetMetadata(ALLOW_MUST_CHANGE_PASSWORD_KEY, true);
