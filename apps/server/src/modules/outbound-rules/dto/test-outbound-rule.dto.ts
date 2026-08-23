import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsUuidFormat } from '../../../common/decorators/is-uuid-format.decorator';

export class TestOutboundRuleDto {
  @ApiProperty({ example: '01012345678' })
  @IsString()
  @MaxLength(32)
  inputNumber!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUuidFormat()
  branchId?: string;
}
