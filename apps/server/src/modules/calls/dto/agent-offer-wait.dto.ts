import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AgentOfferWaitDto {
  @ApiProperty({ description: 'PBX 가 통화 전체에 유지하는 식별자' })
  @IsString()
  linkedid: string;

  @ApiProperty({ description: '제안받는 상담원 내선' })
  @IsString()
  extension: string;

  @ApiProperty({ required: false, description: '발신자 번호. 발신번호 표시제한이면 비어 온다' })
  @IsOptional()
  @IsString()
  caller?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tenantId?: string;

  // 상한을 두는 이유: 이 요청은 서버 커넥션을 그 시간만큼 붙잡는다.
  // 다이얼플랜 실수로 큰 값이 오면 커넥션이 쌓여 서버가 먼저 막힌다.
  @ApiProperty({ description: '상담원 결정을 기다리는 최대 시간(초)' })
  @IsInt()
  @Min(1)
  @Max(60)
  timeoutSeconds: number;
}
