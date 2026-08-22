import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class AgentOfferDecisionDto {
  @ApiProperty({ description: 'PBX 가 통화 전체에 유지하는 식별자' })
  @IsString()
  linkedid: string;

  @ApiProperty({ description: '응답하는 상담원 내선. 인증 세션의 내선과 같아야 한다' })
  @IsString()
  extension: string;

  @ApiProperty({ enum: ['ACCEPT', 'REJECT'] })
  @IsIn(['ACCEPT', 'REJECT'])
  decision: 'ACCEPT' | 'REJECT';
}
