import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateMemoDto {
  @ApiProperty()
  @IsString()
  agentId: string;

  @ApiProperty({ default: 'acw' })
  @IsString()
  memoType: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  resultCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subResultCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  memoText?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}
