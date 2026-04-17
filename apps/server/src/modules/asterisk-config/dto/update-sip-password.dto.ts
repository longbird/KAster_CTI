import { IsString } from 'class-validator';

export class UpdateSipPasswordDto {
  @IsString() sipPassword: string;
}
