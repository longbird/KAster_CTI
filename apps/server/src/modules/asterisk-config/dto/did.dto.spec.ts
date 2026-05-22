import { validateSync } from 'class-validator';
import { CreateDidDto } from './did.dto';

describe('CreateDidDto', () => {
  it('uses PBX terminology in user-facing DID validation messages', () => {
    const dto = Object.assign(new CreateDidDto(), {
      did: '070\n1234',
      representativeNumber: 1234,
      directQueue: 5001,
    });

    const messages = validateSync(dto).flatMap((error) => Object.values(error.constraints ?? {}));

    expect(messages).toContain('DID는 유효한 대표번호 또는 PBX 내선 패턴이어야 합니다.');
    expect(messages).toContain('대표번호는 문자열이어야 합니다.');
    expect(messages).toContain('직접 연결할 호 분배룰은 문자열이어야 합니다.');
    expect(messages.join(' ')).not.toMatch(/Asterisk/i);
  });
});
