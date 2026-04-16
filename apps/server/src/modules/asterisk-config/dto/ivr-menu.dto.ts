import { IsArray, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class IvrEntryDto {
  @IsString() @Matches(/^[0-9#*]$/, { message: 'digit must be 0-9, # or *' }) digit: string;
  @IsString() label: string;
  @IsString() queueName: string;
}

export class CreateIvrMenuDto {
  @IsString() name: string;
  @IsOptional() @IsString() welcomePrompt?: string;
  @IsOptional() @IsString() menuPrompt?: string;
  @IsOptional() @IsInt() @Min(1) timeoutSecs?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => IvrEntryDto) entries: IvrEntryDto[];
}

export class UpdateIvrMenuDto extends CreateIvrMenuDto {}
