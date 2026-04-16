import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const STRATEGIES = ['rrmemory', 'leastrecent', 'fewestcalls', 'random', 'linear'] as const;

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  queueDisplayName?: string;

  @IsOptional()
  @IsIn(STRATEGIES)
  strategy?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxWaitSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  ringTimeoutSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapupSeconds?: number;

  @IsOptional()
  @IsBoolean()
  autopause?: boolean;
}
