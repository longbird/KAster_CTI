import { countEndpointContacts, countTrunkChannels } from './resource-metrics';

describe('countEndpointContacts', () => {
  it('내선 endpoint 의 등록 수와 응답 수를 센다', () => {
    const result = countEndpointContacts([
      { Event: 'ContactList', Endpoint: '3301', Status: 'Reachable', RoundtripUsec: '6471' },
      { Event: 'ContactList', Endpoint: '3302', Status: 'Unreachable', RoundtripUsec: 'N/A' },
      { Event: 'ContactList', Endpoint: '3303', Status: 'Reachable', RoundtripUsec: '5206' },
      { Event: 'ContactListComplete' },
    ] as any);

    expect(result).toEqual({ registered: 3, reachable: 2 });
  });

  it('같은 내선의 contact 가 둘이어도 단말 하나로 센다', () => {
    // max_contacts=2 라 소프트폰이 죽으면서 남긴 contact 가 같이 잡힌다.
    // 그걸 2대로 세면 등록 단말 수가 실제보다 부풀어 추이가 거짓말을 한다.
    const result = countEndpointContacts([
      { Event: 'ContactList', Endpoint: '1001', Status: 'Reachable' },
      { Event: 'ContactList', Endpoint: '1001', Status: 'Unreachable' },
    ] as any);

    expect(result).toEqual({ registered: 1, reachable: 1 });
  });

  it('ObjectName 만 있는 프레임에서도 내선을 뽑는다', () => {
    const result = countEndpointContacts([
      { Event: 'ContactList', ObjectName: '3304/sip:3304@106.240.160.91:1024', Status: 'Reachable' },
    ] as any);

    expect(result).toEqual({ registered: 1, reachable: 1 });
  });

  it('트렁크와 숫자가 아닌 endpoint 는 내선으로 세지 않는다', () => {
    const result = countEndpointContacts([
      { Event: 'ContactList', Endpoint: 'trunk-070-5234-6380', Status: 'Reachable' },
      { Event: 'ContactList', Endpoint: '3301', Status: 'Reachable' },
    ] as any);

    expect(result).toEqual({ registered: 1, reachable: 1 });
  });

  it('프레임이 없으면 null 이다 — AMI 를 못 읽은 것과 0대 등록은 다른 사실이다', () => {
    expect(countEndpointContacts([])).toBeNull();
  });

  it('ContactList 가 하나도 없는 응답도 null 이다', () => {
    expect(countEndpointContacts([{ Response: 'Success' }] as any)).toBeNull();
  });
});

describe('countTrunkChannels', () => {
  it('트렁크 채널만 센다 — 내선 채널은 트렁크 점유가 아니다', () => {
    const frames = [
      { Event: 'CoreShowChannel', Channel: 'PJSIP/trunk-carrier-main-00000012' },
      { Event: 'CoreShowChannel', Channel: 'PJSIP/3302-0000001a' },
      { Event: 'CoreShowChannel', Channel: 'PJSIP/trunk-carrier-main-00000013' },
      { Event: 'CoreShowChannelsComplete' },
    ] as any;

    expect(countTrunkChannels(frames)).toBe(2);
  });

  it('트렁크 이름이 무엇이든 trunk- 접두사로 판단한다 — 렌더러가 보장하는 계약이다', () => {
    const frames = [
      { Event: 'CoreShowChannel', Channel: 'PJSIP/trunk-070-5234-6380-00000012' },
      { Event: 'CoreShowChannel', Channel: 'PJSIP/1001-0000001a' },
    ] as any;

    expect(countTrunkChannels(frames)).toBe(1);
  });

  it('통화가 없으면 0 이다 — 프레임은 왔으므로 null 이 아니다', () => {
    expect(countTrunkChannels([{ Event: 'CoreShowChannelsComplete' }] as any)).toBe(0);
  });

  it('응답 자체가 없으면 null 이다', () => {
    expect(countTrunkChannels([])).toBeNull();
  });

  it('Local 채널은 세지 않는다 — 같은 통화를 두 번 세게 된다', () => {
    const frames = [
      { Event: 'CoreShowChannel', Channel: 'Local/3302@agent-phone-3302-0001;1' },
      { Event: 'CoreShowChannel', Channel: 'PJSIP/trunk-carrier-main-00000012' },
      { Event: 'CoreShowChannelsComplete' },
    ] as any;

    expect(countTrunkChannels(frames)).toBe(1);
  });
});
