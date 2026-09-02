import { parseNodeConfig } from './node-config.parser';
import type { ConditionConfig, MenuConfig, PlayConfig } from './flow-graph.types';

describe('parseNodeConfig', () => {
  describe('공통', () => {
    it('모르는 노드 타입은 그 값을 담아 던진다', () => {
      expect(() => parseNodeConfig('DANCE' as any, {})).toThrow(/DANCE/);
    });

    it('객체가 아닌 config 는 던진다', () => {
      expect(() => parseNodeConfig('HANGUP', 'nope' as any)).toThrow(/object/i);
      expect(() => parseNodeConfig('HANGUP', null as any)).toThrow(/object/i);
      expect(() => parseNodeConfig('HANGUP', [] as any)).toThrow(/object/i);
    });

    // 개행 하나가 곧 dialplan 주입이다. 렌더러의 assertNoNewlines 이전에 여기서 먼저 막는다.
    it('개행이 든 문자열은 던진다', () => {
      expect(() => parseNodeConfig('QUEUE', { queueName: 'sales\nexten => 1,1,Hangup()' })).toThrow(/newline/i);
    });
  });

  describe('PLAY', () => {
    it('프롬프트 목록을 정리해서 준다', () => {
      const config = parseNodeConfig('PLAY', { promptKeys: [' welcome ', 'notice'] }) as PlayConfig;

      expect(config.promptKeys).toEqual(['welcome', 'notice']);
    });

    it('비문자열과 빈 값은 버린다', () => {
      const config = parseNodeConfig('PLAY', { promptKeys: ['a', 3, null, '  '] }) as PlayConfig;

      expect(config.promptKeys).toEqual(['a']);
    });

    it('남는 프롬프트가 없으면 던진다', () => {
      expect(() => parseNodeConfig('PLAY', { promptKeys: [] })).toThrow(/promptKeys/);
      expect(() => parseNodeConfig('PLAY', {})).toThrow(/promptKeys/);
    });
  });

  describe('MENU', () => {
    it('기본값을 채운다', () => {
      const config = parseNodeConfig('MENU', {}) as MenuConfig;

      expect(config).toEqual({ promptKey: null, timeoutSeconds: 5, maxRetries: 2 });
    });

    it('주어진 값을 쓴다', () => {
      const config = parseNodeConfig('MENU', {
        promptKey: 'main-menu',
        timeoutSeconds: 8,
        maxRetries: 1,
      }) as MenuConfig;

      expect(config).toEqual({ promptKey: 'main-menu', timeoutSeconds: 8, maxRetries: 1 });
    });

    // 0초면 WaitExten 이 바로 지나가 메뉴가 무의미해진다. 기존 renderIvrMenu 도 0 이하를 던진다.
    it('대기 시간이 범위 밖이면 던진다', () => {
      expect(() => parseNodeConfig('MENU', { timeoutSeconds: 0 })).toThrow(/timeoutSeconds/);
      expect(() => parseNodeConfig('MENU', { timeoutSeconds: 120 })).toThrow(/timeoutSeconds/);
    });

    it('재시도 횟수가 범위 밖이면 던진다', () => {
      expect(() => parseNodeConfig('MENU', { maxRetries: -1 })).toThrow(/maxRetries/);
      expect(() => parseNodeConfig('MENU', { maxRetries: 9 })).toThrow(/maxRetries/);
    });
  });

  describe('QUEUE / TRANSFER / SMS', () => {
    it('큐 이름을 다듬어 준다', () => {
      expect(parseNodeConfig('QUEUE', { queueName: ' sales ' })).toEqual({ queueName: 'sales' });
    });

    it('큐 이름이 없으면 던진다', () => {
      expect(() => parseNodeConfig('QUEUE', {})).toThrow(/queueName/);
      expect(() => parseNodeConfig('QUEUE', { queueName: '   ' })).toThrow(/queueName/);
    });

    it('전환 번호가 없으면 던진다', () => {
      expect(() => parseNodeConfig('TRANSFER', {})).toThrow(/transferNumber/);
    });

    it('문자 템플릿 id 가 없으면 던진다', () => {
      expect(() => parseNodeConfig('SMS', {})).toThrow(/smsTemplateId/);
    });
  });

  describe('OPT_OUT', () => {
    it('기본은 등록이다', () => {
      expect(parseNodeConfig('OPT_OUT', {})).toEqual({ action: 'REGISTER', targetSource: 'CALLER' });
    });

    it('해제도 받는다', () => {
      expect(parseNodeConfig('OPT_OUT', { action: 'UNREGISTER' }))
        .toEqual({ action: 'UNREGISTER', targetSource: 'CALLER' });
    });

    it('모르는 동작은 그 값을 담아 던진다', () => {
      expect(() => parseNodeConfig('OPT_OUT', { action: 'DELETE_ALL' })).toThrow(/DELETE_ALL/);
    });
  });

  describe('CONDITION', () => {
    it('시간 조건은 시작과 끝을 요구한다', () => {
      const config = parseNodeConfig('CONDITION', {
        conditionType: 'TIME_RANGE',
        timeStart: '09:00',
        timeEnd: '18:00',
        daysOfWeek: ['mon', 'tue'],
      }) as ConditionConfig;

      expect(config).toEqual({
        conditionType: 'TIME_RANGE',
        timeStart: '09:00',
        timeEnd: '18:00',
        daysOfWeek: ['mon', 'tue'],
      });
    });

    it('시간 조건인데 시각이 없으면 던진다', () => {
      expect(() => parseNodeConfig('CONDITION', { conditionType: 'TIME_RANGE' })).toThrow(/timeStart/);
    });

    it('시각 형식이 틀리면 던진다', () => {
      expect(() =>
        parseNodeConfig('CONDITION', { conditionType: 'TIME_RANGE', timeStart: '9시', timeEnd: '18:00' }),
      ).toThrow(/timeStart/);
    });

    it('모르는 요일은 버린다', () => {
      const config = parseNodeConfig('CONDITION', {
        conditionType: 'TIME_RANGE',
        timeStart: '09:00',
        timeEnd: '18:00',
        daysOfWeek: ['mon', 'funday'],
      }) as ConditionConfig;

      expect(config.daysOfWeek).toEqual(['mon']);
    });

    it('공휴일 조건은 시각을 요구하지 않는다', () => {
      expect(parseNodeConfig('CONDITION', { conditionType: 'HOLIDAY' })).toEqual({
        conditionType: 'HOLIDAY',
        timeStart: null,
        timeEnd: null,
        daysOfWeek: [],
      });
    });

    it('모르는 조건 종류는 던진다', () => {
      expect(() => parseNodeConfig('CONDITION', { conditionType: 'WEATHER' })).toThrow(/WEATHER/);
    });
  });

  describe('HANGUP', () => {
    it('안내 없이도 만들 수 있다', () => {
      expect(parseNodeConfig('HANGUP', {})).toEqual({ promptKey: null });
    });

    it('마지막 안내를 붙일 수 있다', () => {
      expect(parseNodeConfig('HANGUP', { promptKey: 'goodbye' })).toEqual({ promptKey: 'goodbye' });
    });
  });
});

describe('parseNodeConfig — COLLECT_DIGITS', () => {
  it('자릿수·대기·재시도를 읽는다', () => {
    expect(
      parseNodeConfig('COLLECT_DIGITS', {
        promptKey: 'custom/enter_number',
        minDigits: 10,
        maxDigits: 11,
        timeoutSeconds: 8,
        maxRetries: 3,
      }),
    ).toEqual({
      promptKey: 'custom/enter_number',
      minDigits: 10,
      maxDigits: 11,
      timeoutSeconds: 8,
      maxRetries: 3,
    });
  });

  it('생략하면 기본값을 쓴다', () => {
    expect(parseNodeConfig('COLLECT_DIGITS', {})).toEqual({
      promptKey: null,
      minDigits: 1,
      maxDigits: 11,
      timeoutSeconds: 5,
      maxRetries: 2,
    });
  });

  it('최소가 최대보다 크면 막는다 — 영원히 못 채우는 조건이다', () => {
    expect(() => parseNodeConfig('COLLECT_DIGITS', { minDigits: 12, maxDigits: 4 }))
      .toThrow(/minDigits/);
  });

  it('자릿수 상한을 넘기면 막는다', () => {
    expect(() => parseNodeConfig('COLLECT_DIGITS', { maxDigits: 99 })).toThrow(/maxDigits/);
  });
});

describe('parseNodeConfig — 대상 번호 출처', () => {
  it('SMS 는 기본이 발신번호다 — 이 필드가 없던 기존 그래프가 그대로 동작해야 한다', () => {
    expect(parseNodeConfig('SMS', { smsTemplateId: 't1' }))
      .toEqual({ smsTemplateId: 't1', targetSource: 'CALLER' });
  });

  it('OPT_OUT 도 기본이 발신번호다', () => {
    expect(parseNodeConfig('OPT_OUT', { action: 'REGISTER' }))
      .toEqual({ action: 'REGISTER', targetSource: 'CALLER' });
  });

  it('입력값을 대상으로 지정할 수 있다', () => {
    expect(parseNodeConfig('OPT_OUT', { action: 'UNREGISTER', targetSource: 'collected' }))
      .toEqual({ action: 'UNREGISTER', targetSource: 'COLLECTED' });
  });

  it('모르는 출처는 막는다', () => {
    expect(() => parseNodeConfig('SMS', { smsTemplateId: 't1', targetSource: 'CRM' }))
      .toThrow(/targetSource/);
  });
});

describe('parseNodeConfig — HTTP_LOOKUP', () => {
  it('엔드포인트 id 와 대기 안내를 읽는다', () => {
    expect(parseNodeConfig('HTTP_LOOKUP', { endpointId: 'ep-1', waitPromptKey: 'custom/checking' }))
      .toEqual({ endpointId: 'ep-1', waitPromptKey: 'custom/checking' });
  });

  it('대기 안내는 없어도 된다 — 대신 그동안 무음이다', () => {
    expect(parseNodeConfig('HTTP_LOOKUP', { endpointId: 'ep-1' }))
      .toEqual({ endpointId: 'ep-1', waitPromptKey: null });
  });

  it('엔드포인트를 안 고르면 막는다', () => {
    expect(() => parseNodeConfig('HTTP_LOOKUP', {})).toThrow(/endpointId/);
  });

  it('주소를 노드에 적을 자리가 없다 — 넣어도 버린다', () => {
    expect(parseNodeConfig('HTTP_LOOKUP', { endpointId: 'ep-1', url: 'http://evil/' }))
      .not.toHaveProperty('url');
  });
});
