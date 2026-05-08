import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'seoul' })
  @IsString()
  @MaxLength(32)
  branchCode!: string;

  @ApiProperty({ example: '서울 본사' })
  @IsString()
  @MaxLength(128)
  branchName!: string;

  @ApiProperty({ required: false, example: '대표 운영 지사' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    required: false,
    description: 'VIP 고객 통화 시 사용할 멘트 (AsteriskPrompt FK). BlueSky Jisa.m_nMentVipCD 등가.',
  })
  @IsOptional()
  @IsUUID()
  vipPromptId?: string | null;

  @ApiProperty({
    required: false,
    description: '지사 기본 공유규칙 (shareRules FK). BlueSky ShareRule 매트릭스.',
  })
  @IsOptional()
  @IsUUID()
  defaultShareRuleId?: string | null;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
