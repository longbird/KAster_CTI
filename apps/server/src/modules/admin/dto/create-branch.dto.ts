import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
