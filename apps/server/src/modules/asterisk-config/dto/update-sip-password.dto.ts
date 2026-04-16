import { IsString, MinLength } from 'class-validator';

export class UpdateSipPasswordDto {
  @IsString() @MinLength(1) sipPassword: string;
}
