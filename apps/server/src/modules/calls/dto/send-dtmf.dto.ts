import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * 한 자리마다 AMI PlayDTMF 액션이 하나씩 나가고, 그동안 채널은 톤 재생에 붙잡힌다.
 * 상한이 없으면 요청 한 번으로 통화를 임의 시간 동안 점유할 수 있다.
 * 32 는 실제 입력(내선 3~4자리, 주민번호 13자리, 카드번호 16자리 + 유효기간)을
 * 여유 있게 덮으면서 채널 점유를 수 초 이내로 묶는 값이다.
 */
export const DTMF_MAX_DIGITS = 32;

export class SendDtmfDto {
  @ApiProperty({
    description: `통화 중 상대에게 보낼 DTMF 자릿수. 0-9, *, # 만 허용하며 최대 ${DTMF_MAX_DIGITS}자리.`,
    example: '1234#',
    maxLength: DTMF_MAX_DIGITS,
  })
  @IsString()
  @MaxLength(DTMF_MAX_DIGITS)
  // 이 값은 AMI 액션 필드로 그대로 나간다. AMI 는 \r\n 으로 필드를 구분하므로
  // 개행이 통과하면 임의 AMI 액션을 주입할 수 있다. 앵커(^$)를 붙이고 m 플래그를
  // 쓰지 않아야 끝에 붙은 개행도 걸린다. + 는 빈 문자열도 함께 거절한다.
  @Matches(/^[0-9*#]+$/, {
    message: 'digits 는 0-9, *, # 만 사용할 수 있습니다.',
  })
  digits!: string;
}
