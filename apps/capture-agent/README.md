# capture-agent

패킷 캡처를 실제로 수행하는 최소 권한 사이드카.

## 왜 별도 컨테이너인가

`server` 컨테이너는 자체 네트워크 네임스페이스에 있다. 그 안에서 `dumpcap` 을 띄우면
컨테이너 veth 만 보이고 호스트의 SIP(`:36070` 트렁크 / `:48950` 단말)·RTP(`10000-20000`)는
한 패킷도 잡히지 않는다. Asterisk 는 호스트 OS 에서 돌기 때문이다.

`server` 를 `network_mode: host` 로 옮기면 캡처는 되지만 `postgres` / `redis` 서비스명 DNS 와
`ports:` 매핑이 깨진다. 그래서 **host 네트워크와 `NET_RAW` 는 이 작은 프로세스에만** 준다.

## 통신

포트를 열지 않는다. 공유 볼륨의 **유닉스 소켓**(`/var/run/kaster/capture.sock`)으로만 통신하며,
모든 요청은 `x-kaster-internal-secret` 헤더를 timing-safe 비교로 검사한다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/status` | dumpcap 가용 여부, 실행 중인 작업, 직전 결과 |
| GET | `/interfaces` | 캡처 가능한 인터페이스 |
| POST | `/start` | `{ jobId, interfaceName, captureFilter, durationSeconds, outputPath }` |
| POST | `/stop` | `{ jobId }` |

## 방어

- 서버가 이미 검증한 값이라도 **여기서 다시 검사한다.** 권한을 가진 쪽은 호출자를 신뢰하지 않는다.
  규칙은 `apps/server/src/modules/packet-capture/capture-filter.util.ts` 와 같다. 한쪽을 고치면 다른 쪽도 고친다.
- `outputPath` 가 `PACKET_CAPTURE_STORAGE_ROOT` 밖이면 거부한다 (경로 탈출 방지).
- 동시에 하나의 캡처만 허용한다.
- npm 의존성이 없다. 이 프로세스가 유일하게 `NET_RAW` 를 가지므로 공급망 표면을 최소로 둔다.

## 환경변수

| 이름 | 기본값 |
|---|---|
| `KASTER_INTERNAL_SECRET` | (필수) |
| `CAPTURE_AGENT_SOCKET` | `/var/run/kaster/capture.sock` |
| `PACKET_CAPTURE_DUMPCAP_PATH` | `/usr/bin/dumpcap` |
| `PACKET_CAPTURE_STORAGE_ROOT` | `/var/spool/kaster/packet-capture` |
| `PACKET_CAPTURE_MAX_FILE_MB` | `500` |
