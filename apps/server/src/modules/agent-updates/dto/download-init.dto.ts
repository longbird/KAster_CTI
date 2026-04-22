import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DownloadInitDto {
  @ApiProperty({ example: 'agent-win-x64-1.4.0' })
  @IsString()
  artifactId: string;

  @ApiProperty({ example: '1.3.2' })
  @IsString()
  currentVersion: string;
}
