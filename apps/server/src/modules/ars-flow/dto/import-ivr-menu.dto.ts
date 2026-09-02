import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ImportIvrMenuDto {
  @ApiProperty({ description: '가져올 기존 IVR 메뉴 id' })
  @IsUUID()
  menuId!: string;
}
