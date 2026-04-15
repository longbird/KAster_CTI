import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class TransferDto {
  @ApiProperty({ enum: ['blind', 'attended', 'queue', 'external'] })
  @IsString()
  @IsIn(['blind', 'attended', 'queue', 'external'])
  transferType: string;

  @ApiProperty()
  @IsString()
  target: string;

  @ApiProperty()
  @IsString()
  fromExtension: string;
}
