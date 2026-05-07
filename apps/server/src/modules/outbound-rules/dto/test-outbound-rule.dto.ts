import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TestOutboundRuleDto {
  @ApiProperty({ example: '01012345678' })
  @IsString()
  @MaxLength(32)
  inputNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
