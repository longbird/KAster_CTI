import { IsString, MaxLength } from 'class-validator';
import { ExecuteOptOutActionDto } from './execute-opt-out-action.dto';

export class ExecuteSmartOptOutDto extends ExecuteOptOutActionDto {
  @IsString()
  @MaxLength(32)
  targetPhoneNumber: string;
}
