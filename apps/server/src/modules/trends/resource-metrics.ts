/**
 * AMI 조회 응답에서 리소스 지표를 뽑는다.
 *
 * 여기서 `null` 과 `0` 은 전혀 다른 뜻이다. `0` 은 "읽었고 없었다", `null` 은
 * "못 읽었다"이다. AMI 가 끊긴 구간을 0 으로 적재하면 나중에 용량을 볼 때
 * 트렁크가 놀고 있었던 것처럼 보인다. 그래서 프레임이 아예 없으면 null 을 준다.
 */
import type { ParsedAmiFrame } from '../ami/ami.parser';

export interface EndpointContactCounts {
  registered: number;
  reachable: number;
}

/** `ObjectName` 은 `3304/sip:3304@host:port` 꼴이라 앞부분만 쓴다. */
function extractExtension(frame: ParsedAmiFrame): string | null {
  const endpoint = frame.Endpoint?.trim();
  const fromObject = (frame.ObjectName ?? '').split('/')[0]?.trim();
  const extension = endpoint || fromObject;
  if (!extension || !/^\d+$/.test(extension)) return null;
  return extension;
}

/**
 * 등록된 내선 단말 수와 그중 응답하는 수.
 *
 * <b>내선 단위로 센다.</b> `max_contacts=2` 라서 소프트폰이 비정상 종료하면
 * 죽은 contact 가 남고, contact 를 세면 등록 단말 수가 부풀어 추이가 거짓말을 한다.
 */
export function countEndpointContacts(frames: ParsedAmiFrame[]): EndpointContactCounts | null {
  const reachableByExtension = new Map<string, boolean>();

  for (const frame of frames) {
    if (frame.Event !== 'ContactList') continue;
    const extension = extractExtension(frame);
    if (!extension) continue;
    const reachable = frame.Status?.trim() === 'Reachable';
    // 같은 내선에 contact 가 여럿이면 하나라도 살아 있으면 살아 있는 것이다.
    reachableByExtension.set(extension, (reachableByExtension.get(extension) ?? false) || reachable);
  }

  if (reachableByExtension.size === 0) return null;

  return {
    registered: reachableByExtension.size,
    reachable: [...reachableByExtension.values()].filter(Boolean).length,
  };
}

/**
 * 트렁크 채널인가.
 *
 * `pjsip.renderer.ts` 가 트렁크 endpoint 를 항상 `trunk-<슬러그>` 로 만든다.
 * 그 접두사가 계약이므로 트렁크 이름 목록을 따로 넘겨받지 않는다.
 * Local 채널은 같은 통화의 내부 다리라 세면 한 통화를 두 번 센다.
 */
function isTrunkChannel(channel: string): boolean {
  if (!channel.startsWith('PJSIP/')) return false;
  return channel.slice('PJSIP/'.length).startsWith('trunk-');
}

/**
 * 트렁크가 점유 중인 채널 수. 외부 회선 용량 판단의 근거다.
 *
 * 프레임이 하나도 없으면 `null`(못 읽음), 채널 프레임만 없으면 `0`(통화 없음)이다.
 */
export function countTrunkChannels(frames: ParsedAmiFrame[]): number | null {
  if (frames.length === 0) return null;

  return frames.filter(
    (frame) => frame.Event === 'CoreShowChannel' && isTrunkChannel(frame.Channel ?? ''),
  ).length;
}
