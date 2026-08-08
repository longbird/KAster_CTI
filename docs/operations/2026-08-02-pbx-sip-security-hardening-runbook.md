# PBX SIP 보안 로그 및 스캔 차단 적용 준비

작성일: 2026-08-02

## 목적

외부에서 `INVITE sip:001...@<PBX>:48950` 형태로 반복 유입되는 SIP 스캔/툴 스푸핑 공격을 운영 PBX가 요금 발생 없이 차단하고, 반복 공격 IP를 자동 격리할 수 있게 준비한다.

## SIP 수신 포트 변경 (2026-08-08 추가)

제품의 SIP 수신 포트 기본값이 **`48950`** 으로 확정됐다 (`tenantSystemSettings.sipRegisterPort`).
아래 문서의 명령과 템플릿은 모두 `48950` 기준으로 갱신했다.

**적용 순서를 지켜야 한다.** 방화벽을 먼저 바꾸면 아직 36070 에 붙어 있는 PBX 로 가는
트래픽이 막히고, PBX 를 먼저 바꾸면 새 포트가 무방비로 열린다.

1. 방화벽에서 두 포트를 **모두 허용**해 둔다 (전환 창)
2. 관리자 화면에서 해당 테넌트의 SIP 수신 포트를 48950 으로 바꾸고 PBX 설정을 재적용한다
3. `ss -lunp` 로 48950 bind 를 확인하고 단말 등록/통화를 확인한다
4. 방화벽에서 36070 을 닫는다

## 2026-08-02 시점에 확인된 상태

- 당시 운영 PBX는 UDP `36070`에서 SIP를 수신했다. **위 전환을 마친 뒤에는 `48950` 이다.**
- trunk identify는 통신사 IP `27.255.98.132`와 테스트 IP `61.42.53.61`만 매칭한다.
- `anonymous` 또는 `guest` endpoint는 생성되어 있지 않다.
- 상담원 전화기 context는 직접 외부 발신이 기본 차단된다.
- `outbound-main-*` context는 해외 `_00.` 및 유료 `_060...` 발신을 먼저 차단한다.

따라서 제시된 공격 패킷의 출발지 `193.104.222.26`은 정상 설정에서는 endpoint 식별 단계에서 거부된다. 단, 패킷 처리는 계속 발생하므로 방화벽/자동 차단이 필요하다.

## 구성 요소

| 항목 | 파일 | 역할 |
| --- | --- | --- |
| 보안 로그/차단 준비 스크립트 | `scripts/pbx-sip-security-prepare.sh` | `logger.conf` 보안 로그 활성화, fail2ban 설정 설치 |
| fail2ban 필터 | `infra/security/pbx-sip-hardening/fail2ban/asterisk-pjsip-scan.conf` | PJSIP 인증 실패/미식별 endpoint 로그 매칭 |
| fail2ban jail 템플릿 | `infra/security/pbx-sip-hardening/fail2ban/kaster-pbx-sip.conf.example` | UDP `48950` 반복 실패 IP ban |
| nftables 템플릿 | `infra/security/pbx-sip-hardening/nftables/pbx-sip-rate-limit.nft.example` | SIP 포트 레이트리밋 예시 |

## 적용 전 점검

```bash
cd /home/blueadm/kaster_cti
git status --short
sudo asterisk -rx "pjsip show endpoints" | head -80
sudo grep -nE "security|messages" /etc/asterisk/logger.conf
sudo ss -lunp | grep ':48950'
```

## dry-run

```bash
cd /home/blueadm/kaster_cti
bash scripts/pbx-sip-security-prepare.sh --sip-port 48950
```

dry-run은 `/etc`에 쓰지 않고, 적용될 명령만 출력한다.

## 실제 적용

```bash
cd /home/blueadm/kaster_cti
sudo bash scripts/pbx-sip-security-prepare.sh --apply --sip-port 48950
```

스크립트가 수행하는 작업:

- `/etc/asterisk/logger.conf`를 `/var/backups/kaster-pbx-hardening/<timestamp>/logger.conf.before`로 백업한다.
- `[logfiles]`에 `security => security`를 추가하거나 주석 해제한다.
- `/var/log/asterisk/security` 파일을 생성하고 권한을 조정한다.
- `asterisk -rx "logger reload"`를 실행한다.
- fail2ban 필터와 jail을 `/etc/fail2ban` 아래에 설치한다.
- fail2ban이 설치되어 있으면 reload 또는 restart를 시도한다.

## 적용 후 확인

```bash
sudo grep -nE "^security[[:space:]]*=>" /etc/asterisk/logger.conf
sudo ls -l /var/log/asterisk/security
sudo fail2ban-client status kaster-pbx-sip
sudo tail -f /var/log/asterisk/security /var/log/asterisk/messages
```

공격 패킷이 계속 들어오면 `/var/log/asterisk/security` 또는 `messages`에 PJSIP 인증 실패/미식별 endpoint 로그가 남고, fail2ban jail의 banned count가 증가해야 한다.

## nftables 레이트리밋

`infra/security/pbx-sip-hardening/nftables/pbx-sip-rate-limit.nft.example`는 예시 파일이다. 적용 전 반드시 `sip_trusted_ipv4`에 실제 통신사 IP와 사내/VPN 상담원 IP 대역을 추가한다.

```bash
sudo nft -c -f infra/security/pbx-sip-hardening/nftables/pbx-sip-rate-limit.nft.example
sudo nft -f infra/security/pbx-sip-hardening/nftables/pbx-sip-rate-limit.nft.example
sudo nft list ruleset | grep -A30 kaster_pbx_sip
```

주의: 현재 템플릿은 trust IP 외 UDP `48950`에 대해 분당 20회 초과 패킷을 drop한다. 실제 상담원 전화기가 공인망에서 직접 붙는 구조라면 IP 대역을 먼저 확정해야 한다.

## 롤백

```bash
sudo cp /var/backups/kaster-pbx-hardening/<timestamp>/logger.conf.before /etc/asterisk/logger.conf
sudo asterisk -rx "logger reload"
sudo rm -f /etc/fail2ban/filter.d/asterisk-pjsip-scan.conf
sudo rm -f /etc/fail2ban/jail.d/kaster-pbx-sip.conf
sudo systemctl reload fail2ban || sudo systemctl restart fail2ban
sudo nft delete table inet kaster_pbx_sip
```

## 의미

이 조치는 세 층으로 나뉜다.

1. PBX 식별 계층: 알 수 없는 IP의 INVITE는 trunk/agent endpoint로 매칭되지 않아 거부된다.
2. PBX dialplan 계층: 인증된 경로로 들어와도 전화기 직접 외부 발신, 해외, 유료 번호는 차단된다.
3. OS 계층: 반복 실패 IP를 fail2ban/nftables로 줄여 PBX까지 도달하는 공격량을 낮춘다.
