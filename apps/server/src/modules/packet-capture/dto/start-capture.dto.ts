import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MIN_CAPTURE_DURATION_SECONDS } from '../capture-filter.util';

export class StartCaptureDto {
  @ApiPropertyOptional({ description: '비우면 PACKET_CAPTURE_INTERFACE 기본값을 쓴다' })
  @IsOptional() @IsString() @MaxLength(64)
  interfaceName?: string;

  @ApiPropertyOptional({ description: 'BPF 표현식. 비우면 전량 캡처', example: 'udp and portrange 10000-20000' })
  @IsOptional() @IsString() @MaxLength(512)
  captureFilter?: string;

  @ApiProperty({ description: '캡처 시간(초). 상한은 PACKET_CAPTURE_MAX_DURATION_SECONDS' })
  @Type(() => Number) @IsInt() @Min(MIN_CAPTURE_DURATION_SECONDS)
  durationSeconds!: number;
}
