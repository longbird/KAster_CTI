import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class PreviewArsFlowQueryDto {
  /** 미리보기에 심을 DID. 실제 적용은 Phase 1 에서 DID 연결을 통해 이뤄진다. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[0-9*#+]+$/, { message: 'did must contain only digits, *, # or +' })
  did: string;
}
