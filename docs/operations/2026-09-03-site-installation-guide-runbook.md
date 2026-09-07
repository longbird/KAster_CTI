# 현장 설치 매뉴얼 (단계별)

작성일: 2026-09-03
대상 버전: `main` 커밋 `d7299d9` · 상담원 데스크톱 1.0.0
대상 독자: 신규 사이트에 KAster CTI 를 처음 세우는 설치 담당자 (서버 · PBX · 네트워크 담당이 다르면 단계별로 나눠 맡는다)
전제: 서버 1대에 PBX 와 CTI(Docker)를 함께 올리는 **단일 서버 구성**을 기준으로 쓴다. 이것이 지금까지 실제로 돌아가는 유일한 구성이다(공유 개발 서버). PBX 를 별도 호스트로 두는 구성은 15장에 한계를 적었다.

> **읽기 전에 알아야 할 것 두 가지**
>
> 1. **이 절차는 운영 사이트에서 리허설된 적이 없다.** 각 단계는 공유 개발 서버에서 검증된 구성(`docker-compose.dev.yml`, 2026-08-21~09-02 QA 기록)과 저장소의 운영 템플릿(`deploy/sites/_template`)을 합쳐 쓴 것이다. 처음 설치할 때는 검증용 DID 하나로 12장의 통화 시험을 끝내기 전까지 실제 회선을 붙이지 않는다.
> 2. **운영 템플릿 `compose.prod.yml` 은 2026-09-03 부터 PBX 마운트·훅 포트·CID 포트·부트스트랩 env 를 모두 갖는다.** 그 전에 만든 사이트 디렉터리는 템플릿을 다시 복제하거나 5.3 의 확인 명령으로 빠진 것을 찾는다.
> 3. **검증된 PBX 는 Asterisk 22 가 아니라 Ubuntu 22.04 apt 패키지 18.10.0 이다** (개발서버 `asterisk -V` 실측 2026-09-03). 설계서의 "22 소스 빌드"는 한 번도 실행되지 않았다. 이 매뉴얼과 설치 스크립트는 18.10 을 기준으로 한다.

### 스크립트로 한 번에 (권장)

3~8장을 `install/install.sh` 가 순서대로 한다 — OS 패키지·Docker, 저장소·사이트 디렉터리·`.env`(비밀 자동 생성), PBX 패키지·기본 파일·권한·마커·SIP 스캔 차단, 방화벽, 컨테이너 기동, 첫 테넌트·관리자·플랫폼 관리자, 검증 20여 항목. 다시 실행해도 비밀과 계정은 유지된다.

```bash
git clone <저장소 URL> /opt/kaster_cti && cd /opt/kaster_cti
sudo install/install.sh --wizard                         # 질문 20개 → install/site.conf → 설치
sudo install/install.sh --config install/site.conf       # 답안 파일이 있으면
sudo install/install.sh --config install/site.conf --dry-run   # 무엇을 할지 보기만
```

인터넷·Docker Hub 가 막힌 서버는 인터넷 되는 PC 에서 `install/make-offline-bundle.sh --site-dir deploy/sites/<사이트코드>` 로 번들(deb·이미지·저장소)을 만들어 `--bundle` 로 준다. 끝나면 `deploy/sites/<사이트코드>/INSTALL-SUMMARY.txt` 에 주소와 첫 비밀번호가 남는다 (금고로 옮기고 지운다). **스크립트가 하지 않는 것**은 9~13장이다: 기능 자격, 상담원 데스크톱 설치 파일 빌드·등록, 트렁크·DID·큐·상담원·멘트 입력과 PBX 첫 적용, 검증 통화, 백업 인수. 세부는 [`install/README.md`](../../install/README.md).

아래 3~8장은 스크립트가 하는 일을 손으로 할 때의 절차이자, 스크립트가 멈췄을 때 어디를 보는지의 설명이다.

---

## 0. 전체 그림

비유하면 **PBX 는 교환대**, **CTI 서버는 교환대 옆 비서**, **상담원 앱은 각 자리의 창**이다.
설치는 교환대를 세우고(2), 비서를 앉히고(3), 둘을 같은 방에 두고(4), 비서에게 회사 이름과 첫 직원 명부를 주고(5), 창을 나눠 주고(6·8), 교환대 배선을 비서가 처음으로 그리게 하는(9) 순서다.

| 단계 | 할 일 | 장 | 담당 | 걸리는 시간(참고) |
|---:|---|---|---|---|
| 1 | 서버 OS · Docker · 시간 동기화 · 방화벽 | 3 | 서버 | 1시간 |
| 2 | PBX(Asterisk 22) 설치와 기본 파일 | 4 | PBX | 2시간 |
| 3 | CTI 서버 컨테이너 기동 | 5 | 서버 | 1시간 |
| 4 | PBX ↔ CTI 결선 확인 | 6 | 서버·PBX | 30분 |
| 5 | 첫 테넌트 · 관리자 · 플랫폼 관리자 | 7 | 서버 | 10분 |
| 6 | 상담원 웹 · 관리자 콘솔 접속 확인 | 8 | 서버 | 30분 |
| 7 | 사이트 기능 자격 | 9 | 플랫폼 관리자 | 10분 |
| 8 | 상담원 데스크톱 앱 배포 | 10 | 서버·앱 | 1시간 |
| 9 | PBX 설정 첫 적용 (트렁크·DID·큐·상담원·멘트) | 11 | 관리자 | 2시간 |
| 10 | 검증 통화 | 12 | 전원 | 1시간 |
| 11 | 백업 · 인수 증적 | 13 | 서버 | 30분 |

값을 받아 적는 표는 [`2026-08-10-installation-scenario-prep-checklist.md`](2026-08-10-installation-scenario-prep-checklist.md) 에 있다. 이 매뉴얼은 **그 값이 다 있다는 전제**로 실행 순서만 적는다.

---

## 1. 준비물

| 구분 | 항목 | 확인 |
|---|---|---|
| 서버 | Linux x86_64 1대 (Ubuntu 24.04 또는 Debian 12 권장), 4 vCPU · 8 GB · SSD 100 GB 이상 (녹취는 별도 산정), 공인 IP 또는 NAT 포워딩 | [ ] |
| 서버 | sudo 가능한 계정. **root 직접 로그인은 막혀 있어도 된다** | [ ] |
| 인터넷 | 서버에서 `deb.debian.org`(또는 Ubuntu 미러) · `github.com` · **Docker Hub** 에 나갈 수 있는가. Docker Hub 가 막힌 곳은 5.4 참조 | [ ] |
| 회선 | 통신사 SIP 트렁크 스펙 — [`../design/sip-trunk-spec-template.md`](../design/sip-trunk-spec-template.md) 양식으로 받은 것 (접속 방식 · IP · 포트 · DTMF · 코덱 · DID 목록 · 발신번호 정책) | [ ] |
| 도메인 | 상담원 · 관리자 · API 3개 (또는 IP 하나에 포트 3개) | [ ] |
| TLS | 외부 LB/프록시에서 종료. 템플릿 nginx 는 80 만 연다 | [ ] |
| 값 | 사이트 코드, 비밀 4개(`POSTGRES_PASSWORD` · `JWT_SECRET` · `AMI_SECRET` · `KASTER_INTERNAL_SECRET`), 플랫폼 관리자 초기 계정 | [ ] |
| 작업 PC | Windows 10/11 + PowerShell 5.1 이상 (한국어 멘트 생성, 데스크톱 설치 파일 빌드) + .NET 8 SDK + Inno Setup 6 | [ ] |
| 시험 | 걸어 볼 휴대폰 1대, 상담석 PC 1대(헤드셋), 검증용 DID 1개 | [ ] |

비밀 값은 이렇게 만든다. 나중에 못 찾으면 다시 만들지 못하므로 사이트 금고에 적어 둔다.

```bash
openssl rand -hex 32        # JWT_SECRET, KASTER_INTERNAL_SECRET, ARS_HTTP_SECRET_KEY 각각
openssl rand -base64 24     # POSTGRES_PASSWORD, AMI_SECRET
```

---

## 2. 포트와 방화벽

| 방향 | 포트 | 용도 | 비고 |
|---|---|---|---|
| 사용자 → 서버 | 80/443 TCP | 상담원 · 관리자 · API/WS | TLS 는 앞단 |
| 전화기·소프트폰 → 서버 | **48950 UDP** | 상담원 SIP 등록 (기본값, 시스템 설정에서 변경) | 5060 을 쓰지 않는다 — 스캔 공격 회피 |
| 통신사 → 서버 | 트렁크 SIP 포트 UDP | 통신사와 합의한 값. `ASTERISK_TRUNK_SIP_PORT` 로 상담원 포트와 분리 | 통신사 IP 만 허용 |
| 양방향 | **10000–20000 UDP** | RTP 음성 (`ASTERISK_RTP_START/END` 기본값) | |
| 서버 내부 | 5038 TCP | AMI (PBX ↔ CTI) | 외부 차단 |
| 서버 내부 | 3000 TCP | CTI API 원본 포트. PBX 훅 스크립트가 `127.0.0.1:3000` 으로 콜백 | 외부 차단, **호스트에는 열어야 한다** (5.3) |
| CID 프로그램 → 서버 | 28002 · 28003 · 28004 TCP | 로지 · 아이콘 · 콜마너 Call Report | 쓰는 프로그램만 |
| 서버 → 외부 | 443 | TTS · AI 제공자 · 문자 webhook · ARS 외부 조회 (쓰는 경우) | |
| 상담원 PC 내부 | 127.0.0.1:48125 | 웹 ↔ 데스크톱 연동 | 방화벽 무관 |

---

## 3. 단계 1 — 서버 준비

```bash
# 1) OS 갱신, 기본 도구
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl jq python3 ca-certificates gnupg

# 2) 시간 동기화 (PBX 와 CTI 가 같은 시계를 봐야 한다)
sudo timedatectl set-timezone Asia/Seoul
timedatectl | grep -E "NTP|synchronized"     # yes 여야 한다

# 3) Docker + Compose (Ubuntu 패키지 — 개발서버가 쓰는 검증된 조합. get.docker.com 의 docker-ce 도 되지만 검증되지 않았다)
sudo apt -y install docker.io docker-compose-v2 fail2ban
sudo usermod -aG docker "$USER" && newgrp docker
docker compose version

# 4) 방화벽 (ufw 예시 — 2장 표대로)
sudo ufw allow 80/tcp; sudo ufw allow 443/tcp
sudo ufw allow 48950/udp
sudo ufw allow 10000:20000/udp
sudo ufw allow from <통신사IP> to any port <트렁크포트> proto udp
sudo ufw enable
```

확인: `docker run --rm hello-world` 가 된다. 안 되면 Docker Hub 가 막힌 것이다 → 5.4.

---

## 4. 단계 2 — PBX 설치

### 4.1 Asterisk 설치 — 검증된 apt 패키지 (18.10)

개발서버(실 PBX 검증의 유일한 근거)는 **Ubuntu 22.04 의 `asterisk` 1:18.10.0** 패키지를 쓴다. 렌더러·훅·녹취·큐가 전부 이 버전에서 확인됐다. 설계서의 22 는 목표이지 검증된 상태가 아니다.

```bash
sudo apt -y install asterisk asterisk-config asterisk-modules \
  asterisk-core-sounds-en asterisk-core-sounds-en-gsm asterisk-moh-opsound-gsm
asterisk -V          # Asterisk 18.10.0~dfsg+...
```

`asterisk-config` 가 샘플 conf 를 `/etc/asterisk` 에 넣는다. 서버가 렌더링하는 파일은 첫 적용 때 덮어써진다. `chan_sip` 이 5060 을 잡지 않게 `modules.conf` 에 `noload => chan_sip.so` 를 넣는다 (스크립트가 한다).

<details>
<summary>대안 — Asterisk 22 소스 빌드 (검증되지 않음)</summary>

설계가 22 LTS 를 전제로 하므로 언젠가 올려야 한다. 아래는 Asterisk 표준 절차이며, **이 저장소에 실행 기록이 없고 렌더러가 22 에서 검증되지 않았다.** 검증용 PBX 에서 먼저 12장을 통과시킨 뒤에 쓴다.

```bash
sudo apt -y install build-essential libssl-dev libncurses5-dev libnewt-dev libxml2-dev \
  libsqlite3-dev uuid-dev libjansson-dev libedit-dev pkg-config subversion wget
cd /usr/src
sudo wget https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-22-current.tar.gz
sudo tar xzf asterisk-22-current.tar.gz && cd asterisk-22.*/
sudo contrib/scripts/install_prereq install
sudo ./configure --with-jansson-bundled --with-pjproject-bundled
sudo make menuselect
```

`menuselect` 에서 아래가 켜져 있어야 한다. 서버가 reload 때 앞의 두 모듈을 명시적으로 `module load` 한다.

| 분류 | 모듈 | 왜 |
|---|---|---|
| Resource Modules | `res_pjsip` 계열 전부, `res_http_websocket`, `res_pjsip_transport_websocket`, `res_musiconhold`, `res_agi`, `res_rtp_asterisk` | 등록 · 웹소켓 · 대기음 · AGI |
| Applications | `app_queue`, `app_mixmonitor`, `app_system`, `app_playback`, `app_read`, `app_dial`, `app_directed_pickup` | 큐 · 녹취 · 훅 · 대리응답 |
| Channel Drivers | `chan_pjsip` (chan_sip 은 끈다) | |
| Codec / Format | `codec_alaw`, `codec_ulaw`, `format_wav`, `format_sln`, `format_pcm` | 8kHz 음원 |
| Core Sound Packages | `CORE-SOUNDS-EN-WAV` | 한국어 멘트가 없는 자리의 기본 안내 |

```bash
sudo make -j"$(nproc)" && sudo make install && sudo make samples && sudo make config
sudo systemctl enable --now asterisk
sudo asterisk -rx "core show version"
```

</details>

### 4.2 기본 설정 파일

서버가 **렌더링해서 덮어쓰는 파일**과 **사람이 한 번 넣어 두는 파일**을 구분한다.

| 파일 | 누가 쓰나 | 비고 |
|---|---|---|
| `pjsip.conf` · `rtp.conf` · `extensions_inbound.conf` · `extensions_queue.conf` · `extensions_agent.conf` · `queues.conf` · 대기음 include | **CTI 서버** (11장에서 처음 적용) | 손으로 고치지 않는다 |
| `extensions.conf` · `extensions_transfer.conf` · `manager.conf` | **사람** (지금) | `infra/asterisk/` 초안을 복사 |
| `logger.conf` | `scripts/pbx-sip-security-prepare.sh` | 4.5 |
| `http.conf` | 사람 | 웹소켓 8088 (`enabled=yes`, `bindaddr=0.0.0.0`, `bindport=8088`) — WebRTC 를 안 쓰면 그대로 두어도 된다 |

```bash
cd /opt && sudo git clone <저장소 URL> kaster_cti && cd kaster_cti
sudo cp infra/asterisk/extensions.conf infra/asterisk/extensions_transfer.conf /etc/asterisk/
sudo cp infra/asterisk/manager.conf /etc/asterisk/manager.conf
sudo nano /etc/asterisk/manager.conf
```

`manager.conf` 에서 고칠 것: `secret` 을 1장에서 만든 `AMI_SECRET` 으로, `permit` 을 Docker 브리지 대역(`172.16.0.0/255.240.0.0`)과 `127.0.0.1` 로. **이 값과 CTI 의 `AMI_USERNAME`/`AMI_SECRET` 은 1:1 이다.**

### 4.3 음원 디렉터리와 권한

CTI 컨테이너가 이 디렉터리에 **멘트 파일과 훅 스크립트를 쓴다.** 훅 스크립트는 `sh` + `curl`, AGI 는 `python3` 로 돈다 (3장에서 설치했다).

```bash
sudo mkdir -p /var/lib/asterisk/sounds/custom /var/lib/asterisk/moh /var/spool/asterisk/monitor
sudo cp infra/asterisk/sounds/custom/*.wav /var/lib/asterisk/sounds/custom/
sudo chown -R asterisk:asterisk /var/lib/asterisk/sounds/custom /var/lib/asterisk/moh /var/spool/asterisk/monitor
sudo chmod 775 /var/lib/asterisk/sounds/custom /var/lib/asterisk/moh
```

컨테이너는 root 로 돌므로 쓰기는 된다. 컨테이너가 만든 파일을 Asterisk(`asterisk` 사용자)가 읽을 수 있어야 하므로, 서버는 훅 스크립트를 `0755` 로 쓴다. `/etc/asterisk` 도 컨테이너가 쓰므로 디렉터리 권한을 확인한다.

```bash
sudo chown -R asterisk:asterisk /etc/asterisk && sudo chmod 775 /etc/asterisk
```

### 4.4 소유자 마커

CTI 서버는 `/etc/asterisk/.kaster-cti-config-owner` 로 "이 PBX 설정을 누가 쓰는가"를 확인한다. 비어 있으면 첫 적용 때 스스로 자기 이름(`ASTERISK_CONF_OWNER_ID`)을 적고, 다른 이름이 적혀 있으면 **쓰기를 거부**한다. 배포 스크립트도 같은 파일을 본다.

```bash
echo "<사이트코드>" | sudo tee /etc/asterisk/.kaster-cti-config-owner
```

`<사이트코드>` 는 5.2 의 `SITE_CODE` 와 `ASTERISK_CONF_OWNER_ID` 에 똑같이 넣는다.

### 4.5 SIP 스캔 차단

```bash
sudo scripts/pbx-sip-security-prepare.sh --sip-port 48950            # dry-run 으로 먼저 본다
sudo scripts/pbx-sip-security-prepare.sh --sip-port 48950 --apply    # root
```

보안 로그(`/var/log/asterisk/security`)를 켜고 반복 등록 시도를 막는다. 세부는 [`2026-08-02-pbx-sip-security-hardening-runbook.md`](2026-08-02-pbx-sip-security-hardening-runbook.md).

확인: `sudo asterisk -rx "manager show settings"` 에 `Manager (AMI): Yes`, `sudo ss -lunp | grep asterisk` 에 5060 이 **없어야** 한다(아직 렌더 전이라 pjsip 전송이 없을 수 있다 — 11장 뒤 다시 본다).

---

## 5. 단계 3 — CTI 서버 컨테이너

### 5.1 사이트 디렉터리

```bash
cd /opt/kaster_cti
cp -r deploy/sites/_template deploy/sites/<사이트코드>
cd deploy/sites/<사이트코드>
cp .env.example .env
```

`.env` 는 Git 에 넣지 않는다 (`.gitignore` 에 있다).

### 5.2 `.env` 채우기

템플릿 `.env.example` 에 전부 있다. 표의 "필수" 는 배포 스크립트가 없거나 기본값이면 멈추는 것이다.

| 변수 | 값 | 필수 |
|---|---|---|
| `SITE_CODE` | 사이트코드 (컨테이너·볼륨 이름에 쓰인다) | 필수 |
| `SITE_DOMAIN` · `ADMIN_DOMAIN` · `API_DOMAIN` · `HTTP_PORT` | 도메인 3개, 80 | 필수 |
| `POSTGRES_DB` · `POSTGRES_USER` · `POSTGRES_PASSWORD` | 기본값 `change_me`/`kaster` 는 거부된다 | 필수 |
| `JWT_SECRET` | hex 32 | 필수 |
| `AMI_HOST` | **`host.docker.internal`** (단일 서버) | 필수 |
| `AMI_PORT` · `AMI_USERNAME` · `AMI_SECRET` · `AMI_RECONNECT_MS` | 5038 · `cti_middleware` · 4.2 의 값 · 5000 | 필수 |
| `ASTERISK_NODE_ID` | `<사이트코드>-pbx-a` (PBX 노드마다 고유) | 필수 |
| `ASTERISK_OUTBOUND_CONTEXT` | `outbound-main` | 필수 |
| `ASTERISK_CONF_DIR` | `/etc/asterisk` | 필수 |
| `REST_CORS_ORIGIN` · `WS_CORS_ORIGIN` | `https://<상담원>,https://<관리자>` | 필수 |
| `VITE_API_BASE_URL` · `VITE_WS_URL` · `VITE_USE_MOCK` · `VITE_ACCESS_TOKEN_KEY` | `https://<API>/api/v1` · `https://<API>` · `false` · `kaster.access_token` | 필수 |
| `KASTER_INTERNAL_SECRET` | hex 32. PBX 훅이 서버를 부를 때 쓴다. 기본값 `change_me_internal` 은 거부된다 | 필수 |
| `ASTERISK_CONF_OWNER_ID` | 비우면 `SITE_CODE`. 4.4 마커와 같아야 한다 | 있음 |
| `ASTERISK_CONF_ALLOW_SHARED_WRITE` | `false` | 있음 |
| `ASTERISK_SOUNDS_DIR` | `/var/lib/asterisk/sounds/custom` | 있음 |
| `ASTERISK_EXTERNAL_MEDIA_ADDRESS` · `ASTERISK_EXTERNAL_SIGNALING_ADDRESS` | 서버 **공인 IP** (NAT 뒤면 반드시) | 있음 |
| `ASTERISK_LOCAL_NETS` | 사내 대역. 기본 `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` | 있음 |
| `ASTERISK_RTP_STUN_ADDRESS` | **비워 둔다.** 닿지 않는 STUN 을 넣으면 통화마다 수십 초 지연된다 (2026-08-21 실측) | 있음 |
| `ASTERISK_TRUNK_SIP_PORT` | 통신사 합의 포트. 비우면 상담원 포트를 함께 쓴다 | 선택 |
| `CID_LOGI_TCP_PORT` · `CID_ICON_TCP_PORT` · `CID_CALLMANOR_TCP_PORT` | 28002 · 28003 · 28004 | 선택 |
| `RECORDING_STORAGE_ROOT` | `/var/spool/asterisk/monitor` | 있음 |
| `RECORDING_ENCRYPTION_ENABLED` · `RECORDING_ENCRYPTION_KEY` | `false` · 비움. 켜는 것은 9장의 자격과 함께 | 선택 |
| `RESILIENCE_LOCAL_SPOOL_DIR` · `RESILIENCE_LKG_DIR` | compose 가 고정한다 (`kaster_spool` · `kaster_lkg` 영속 볼륨). `.env` 에 없다 | 고정 |
| `PLATFORM_ADMIN_BOOTSTRAP_LOGIN` · `PLATFORM_ADMIN_BOOTSTRAP_PASSWORD` | 첫 플랫폼 관리자. 1회용 비밀번호 | 있음 |
| `TENANT_BOOTSTRAP_CODE` · `TENANT_BOOTSTRAP_NAME` · `TENANT_BOOTSTRAP_ADMIN_LOGIN` · `TENANT_BOOTSTRAP_ADMIN_PASSWORD` | 첫 테넌트와 첫 관리자 (7.1). 1회용 비밀번호 | 있음 |
| `TENANT_BOOTSTRAP_ADMIN_EXTENSION` | 관리자 내선. 비우면 `2000` | 선택 |
| `AUTO_SEED_DEMO_DATA` | `false`. 데모가 필요할 때만 7.2 | 있음 |
| `SOFTPHONE_ENABLED` · `SOFTPHONE_SIP_SERVER` · `SOFTPHONE_SIP_DOMAIN` · `SOFTPHONE_SIP_TRANSPORT` | `true` · `<공인IP>:48950` · `<공인IP>` · `udp` — 데스크톱 소프트폰이 등록 정보를 받는 곳 | 있음 |
| `AGENT_ARTIFACT_DIR` | `./agent-artifacts` (10장) | 있음 |
| `PACKET_CAPTURE_ENABLED` | `false` (필요할 때만) | 있음 |
| `CALL_ANALYSIS_*` · `ARS_HTTP_LOOKUP_*` | 기본 꺼짐. 9장 자격과 함께 | 선택 |

### 5.3 `compose.prod.yml` 확인

템플릿의 `server` 서비스가 PBX 연동에 필요한 것을 이미 갖고 있다. 손대지 말고 렌더링 결과로 확인만 한다.

```bash
docker compose -f compose.prod.yml --env-file .env config | grep -A3 "host.docker.internal\|/etc/asterisk\|127.0.0.1"
```

| 있어야 하는 것 | 없으면 생기는 일 |
|---|---|
| `extra_hosts: host.docker.internal:host-gateway` | `AMI_HOST=host.docker.internal` 이 안 풀려 AMI 로그인 실패 |
| `${ASTERISK_CONF_DIR}` · 음원 · `moh` · 녹취 디렉터리 마운트 (호스트 경로 = 컨테이너 경로) | 서버는 뜨지만 PBX 설정 반영 · 멘트 배포 · 녹취 재생이 조용히 실패 |
| `kaster_spool` · `kaster_lkg` 볼륨 | DB 장애 시 스풀이 컨테이너 재생성과 함께 사라짐 |
| `127.0.0.1:3000:3000` | 수신거부 · Smart ARS 훅이 서버를 못 부른다 |
| CID 포트 3개 (28002 · 28003 · 28004) | 타사 CID 프로그램에 레코드가 안 온다 |
| `ASTERISK_CONF_OWNER_ID` 가 `SITE_CODE` 로 풀림 | 마커와 달라 PBX 설정 쓰기가 거부된다 |

> 왜 `127.0.0.1:3000` 인가 — 서버가 PBX 에 써 주는 훅 스크립트(`kaster-opt-out-hook.sh` 등)의 기본 주소가 `http://127.0.0.1:<PORT>` 다. 훅은 PBX 프로세스가 실행하므로 **호스트의 127.0.0.1** 에서 3000 이 열려 있어야 한다. 다른 주소로 바꾸려면 Asterisk 프로세스 환경에 `KASTER_OPT_OUT_API_BASE_URL` / `KASTER_SMART_ARS_API_BASE_URL` 을 준다 (15장).

2026-09-03 이전에 복제한 사이트 디렉터리는 위 항목이 없다. `_template` 을 다시 복제하고 `.env` 만 옮긴다.

### 5.4 이미지 준비

`deploy-prod.sh` 는 `docker compose build` 로 서버 · 상담원 · 관리자 이미지를 서버에서 만든다. 베이스 이미지 `node:22-bookworm-slim` · `postgres:16` · `redis:7` · `nginx:1.27-alpine` 을 Docker Hub 에서 받는다.

Docker Hub 가 막힌 사이트(공유 개발 서버가 그렇다)는 **인터넷이 되는 PC 에서 이미지를 만들어 파일로 옮긴다**:

```bash
# 되는 PC 에서
cd deploy/sites/<사이트코드>
GIT_COMMIT=$(git rev-parse HEAD) BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  docker compose -f compose.prod.yml --env-file .env build server web admin   # 관리자 콘솔 "시스템 버전" 에 커밋이 찍힌다
docker pull postgres:16 && docker pull redis:7 && docker pull nginx:1.27-alpine
docker save kaster/<사이트코드>-server:latest kaster/<사이트코드>-web:latest kaster/<사이트코드>-admin:latest \
  postgres:16 redis:7 nginx:1.27-alpine | gzip > kaster-images.tgz
# 서버에서
gunzip -c kaster-images.tgz | docker load
```

이 경우 5.5 의 스크립트 대신 `docker compose up -d` 를 직접 쓴다 (스크립트의 `build` 단계가 실패한다).

### 5.5 기동

```bash
cd /opt/kaster_cti/deploy/sites/<사이트코드>
docker compose -f compose.prod.yml --env-file .env config >/dev/null && echo OK     # 문법·변수 검사
../../../scripts/deploy-prod.sh --site-dir . --skip-backup                          # 첫 배포는 백업 없음
```

스크립트가 하는 일: 필수 env 검사 → 기본 비밀 거부 → 마커 검사 → 이미지 빌드(`GIT_COMMIT`·`BUILD_TIME` 주입) → postgres · redis → server(부팅 시 `prisma migrate deploy` 자동) → web · admin · gateway → `GET /api/v1/health/ready` 30회 재시도.

확인:

```bash
docker compose -f compose.prod.yml --env-file .env ps                   # 전부 Up (healthy)
docker compose -f compose.prod.yml --env-file .env logs --tail=80 server
curl -s http://127.0.0.1:3000/api/v1/health | jq .
```

로그에 `prisma migrate deploy` 완료와 AMI 로그인 성공이 보여야 하고, health 응답의 `data.checks.ami` 가 `"connected"` 여야 한다. 로그인 실패면 4.2 의 secret/permit 을 본다.

---

## 6. 단계 4 — PBX ↔ CTI 결선 확인

| 확인 | 명령 | 정상 |
|---|---|---|
| AMI 연결 | `curl -s 127.0.0.1:3000/api/v1/health` 의 `data.checks.ami` | `"connected"` (`db` · `redis` 는 `"up"` 계열, `status` 는 `"ok"`) |
| PBX 시각 편차 | 관리자 콘솔 > 시스템 설정 > 시간 동기화 (8장 뒤) | 수 초 이내 |
| 마커 | `cat /etc/asterisk/.kaster-cti-config-owner` | 사이트코드 |
| 컨테이너에서 PBX 디렉터리 쓰기 | `docker exec kaster-<사이트코드>-server touch /etc/asterisk/.w && sudo rm /etc/asterisk/.w` | 오류 없음 |
| 컨테이너에서 음원 디렉터리 쓰기 | 위와 같이 `/var/lib/asterisk/sounds/custom/.w` | 오류 없음 |
| 훅 콜백 경로 | PBX 호스트에서 `curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:3000/api/v1/health` | `200` |

---

## 7. 단계 5 — 첫 테넌트 · 관리자 · 플랫폼 관리자

테넌트(회사)와 첫 관리자는 **서버가 첫 부팅에서 env 로 만든다.** 화면과 API 는 없다 (플랫폼 관리자도 테넌트 목록만 본다).

### 7.1 첫 테넌트와 관리자 — `.env` 네 줄

5.2 에서 다음을 채웠으면 서버가 부팅할 때 **테넌트가 0건일 때만** 테넌트 1개와 `admin` 역할 상담원 1명을 한 트랜잭션으로 만든다.

```bash
TENANT_BOOTSTRAP_CODE=<사이트코드>          # 영문·숫자. 바꿀 일 없는 식별자
TENANT_BOOTSTRAP_NAME=<회사명>
TENANT_BOOTSTRAP_ADMIN_LOGIN=admin
TENANT_BOOTSTRAP_ADMIN_PASSWORD=<임시비밀번호>
TENANT_BOOTSTRAP_ADMIN_EXTENSION=2000        # 비우면 2000
```

확인:

```bash
docker compose -f compose.prod.yml --env-file .env logs server | grep -i "테넌트"
# → "첫 테넌트 '<사이트코드>' 와 관리자 'admin' (내선 2000) 를 만들었습니다"
```

규칙:

- 테넌트가 하나라도 있으면 아무것도 하지 않는다. 그래서 `.env` 에 값이 남아 있어도 재배포 때 비밀번호가 되돌아가지 않는다. 계정이 생기면 네 줄은 비운다.
- 첫 테넌트 id 는 고정값 `00000000-0000-0000-0000-000000000001` 이다. PBX 이벤트에 테넌트 정보가 없을 때 서버가 이 id 로 보내므로 **바꾸지 않는다.**
- 관리자 비밀번호는 1회용이다. 관리자 콘솔(8장)에 들어가서 운영 설정 > 상담원 설정 > 비밀번호 초기화로 바꾼다. **첫 로그인 강제 변경은 없다** — 절차로 지킨다.
- 부팅 로그에 "테넌트 부트스트랩 실패" 가 나오면 마이그레이션이 안 끝난 것이다. `up -d server` 로 다시 띄운다.

### 7.2 데모 데이터가 필요할 때만 — 시드

검증·시연용으로 상담원 2명 · 큐 `sales` · 고객 1명 · 통화 1건이 필요하면 시드를 **한 번만** 돌린다. 시드는 같은 고정 id 의 테넌트 `main` 을 만들므로 **7.1 과 같이 쓰지 않는다** (7.1 이 먼저 만들었으면 시드는 같은 고정 id 를 다시 넣으려다 실패한다). 운영 사이트에는 넣지 않는다.

```bash
# .env
AUTO_SEED_DEMO_DATA=true
SEED_DEMO_PASSWORD=<임시비밀번호>
# compose.prod.yml 의 server.environment 에 SEED_DEMO_PASSWORD: ${SEED_DEMO_PASSWORD-} 한 줄을 추가한다

docker compose -f compose.prod.yml --env-file .env up -d server
docker compose -f compose.prod.yml --env-file .env logs --tail=40 server | grep -i seed
sed -i 's/^AUTO_SEED_DEMO_DATA=.*/AUTO_SEED_DEMO_DATA=false/' .env      # 바로 끈다
```

시드 계정은 `agent1001 / 1001`(agent) · `supervisor1 / 2001`(supervisor) 이다. 검증이 끝나면 비활성화한다.

### 7.3 테넌트를 더 만들 때 — SQL

부트스트랩은 첫 테넌트만 만든다. 한 서버에 두 번째 회사를 올리면 SQL 로 넣는다. 이 방법은 개발서버에서 실행해 본 적이 없으므로 관리자 콘솔 로그인이 되는지 바로 확인한다.

```bash
PG="docker compose -f compose.prod.yml --env-file .env exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB"
$PG -c "INSERT INTO tenants (\"tenantCode\",\"tenantName\") VALUES ('<코드>','<회사명>') RETURNING \"tenantId\";"
docker exec kaster-<사이트코드>-server node -e "require('bcryptjs').hash(process.argv[1],10).then(console.log)" '<관리자비밀번호>'
$PG -c "INSERT INTO agents (\"tenantId\",\"loginId\",\"loginPasswordHash\",\"agentCode\",\"agentName\",\"extension\",\"role\")
        VALUES ('<tenantId>','admin','<해시>','admin','admin','2000','admin');"
```

두 번째 테넌트는 고정 id 가 아니므로, PBX 이벤트가 그 테넌트로 가려면 이벤트에 `TenantId` 가 실려야 한다. 멀티테넌트 PBX 구성은 이 매뉴얼 범위 밖이다.

### 7.4 플랫폼 관리자

5.2 에서 `PLATFORM_ADMIN_BOOTSTRAP_LOGIN/PASSWORD` 를 넣었으면 서버가 **플랫폼 관리자가 0명일 때** 첫 계정을 만든다. `https://<관리자>/platform/login` 으로 들어가 **첫 로그인에서 비밀번호를 바꾼다** (바꾸기 전에는 다른 화면이 열리지 않는다). 그 뒤 `.env` 의 부트스트랩 두 줄은 비워도 된다 (계정이 있으면 아무것도 하지 않는다).

---

## 8. 단계 6 — 상담원 웹 · 관리자 콘솔 접속

1. DNS 또는 hosts 에 도메인 3개를 서버로 향하게 한다. TLS 를 앞단에서 종료했으면 `X-Forwarded-Proto` 가 넘어오는지 확인한다.
2. `https://<관리자>` → 7.1 의 admin 계정 (`admin / <임시비밀번호> / 2000`) 으로 로그인.
3. `https://<상담원>` → 같은 계정으로 로그인 (역할과 무관하게 상담 화면은 열린다).

**번들에 개발용 주소가 박혔는지 확인한다.** 이것을 빠뜨려 관리자 화면이 통째로 "Network Error" 가 된 적이 있다(2026-08-24).

```bash
docker exec kaster-<사이트코드>-admin sh -c 'grep -rc "localhost:3000" /usr/share/nginx/html/assets/*.js | grep -v ":0$"'   # 아무것도 안 나와야 한다
docker exec kaster-<사이트코드>-web   sh -c 'grep -rc "localhost:3000" /usr/share/nginx/html/assets/*.js | grep -v ":0$"'
```

나오면 `.env` 의 `VITE_*` 를 고치고 `web` · `admin` 을 다시 빌드한다. 이미지를 안 만드는 배포(5.4 의 파일 반입, 또는 bind-mount)라면 작업 PC 에서 `KASTER_PUBLIC_HOST=<API 도메인> ./scripts/build-frontend-dist.sh admin` 으로 만든다 — 이 스크립트가 값을 주입하고 되읽어 검증한다.

관리자 콘솔 > 시스템 모니터링에서 DB · Redis · PBX 가 초록인지, 시스템 설정 > 시간 동기화의 편차를 본다.

---

## 9. 단계 7 — 사이트 기능 자격

`https://<관리자>/platform/login` → 테넌트 → 기능. 기본값은 패킷 캡처만 켜짐이다. 필요한 것만 켠다.

| 기능 | 켜기 전에 준비할 env | 되돌릴 수 있나 |
|---|---|---|
| 통화 AI 분석 · AI 인사이트 | `CALL_ANALYSIS_ENABLED=true` + STT/LLM 제공자 (`CALL_ANALYSIS_STT_PROVIDER` 등) | 예 |
| ARS 플로우 빌더 | 없음 | 예 |
| ARS 외부 조회 | `ARS_HTTP_LOOKUP_ENABLED=true` + `ARS_HTTP_SECRET_KEY` (녹취 키와 **다른** 키) | 예 |
| 녹취 암호화 | `RECORDING_ENCRYPTION_ENABLED=true` + `RECORDING_ENCRYPTION_KEY` | **아니오.** 켜면 잠긴다. 키를 잃으면 녹취를 못 듣는다. 검증용 테넌트에서 먼저 |
| 패킷 캡처 | `PACKET_CAPTURE_ENABLED=true` + `capture-agent` 컨테이너 | 예 |

env 를 바꾸면 `compose.prod.yml` 에 그 변수를 넘기는 줄이 있는지 확인하고 `up -d server` 로 재생성한다. `restart` 는 바뀐 compose 를 반영하지 않는다.

---

## 10. 단계 8 — 상담원 데스크톱 앱 배포

### 10.1 설치 파일 만들기 (작업 PC, Windows)

```powershell
cd apps\desktop-win
pwsh tools\build-release.ps1 -Version 1.0.0          # 테스트 → 게시(self-contained win-x64) → Inno Setup → release.json
```

산출물: `release\KAsterAgent-1.0.0-Setup.exe` + `release\release.json` (지문 포함). 상담원 PC 에 .NET 런타임을 따로 깔 필요가 없다. 코드 서명 인증서가 있으면 `-RequireSign` 을 붙인다 — **없으면 서명되지 않은 파일이 나가고 SmartScreen 경고가 뜬다** ([`../design/agent-desktop-internal-code-signing.md`](../design/agent-desktop-internal-code-signing.md)).

### 10.2 서버에 올리고 등록하기

```bash
sudo mkdir -p /opt/kaster_cti/deploy/sites/<사이트코드>/agent-artifacts
sudo chown "$USER" /opt/kaster_cti/deploy/sites/<사이트코드>/agent-artifacts
KASTER_REMOTE=<계정>@<서버> \
KASTER_ARTIFACT_DIR=/opt/kaster_cti/deploy/sites/<사이트코드>/agent-artifacts \
KASTER_PG_CONTAINER=kaster-<사이트코드>-postgres \
KASTER_SERVER_CONTAINER=kaster-<사이트코드>-server \
KASTER_PG_USER=<POSTGRES_USER> KASTER_PG_DB=<POSTGRES_DB> \
./scripts/publish-desktop-release.sh --dry-run          # 무엇을 할지 본다
./scripts/publish-desktop-release.sh --notes "첫 배포"  # 전송 → 원격 지문 재검증 → 컨테이너 가시성 확인 → DB 등록
```

스크립트 기본값은 공유 개발 서버(`blueadm@49.247.46.86`)로 박혀 있으므로 **env 다섯 개를 반드시 덮어쓴다.** `--tenant` 를 안 주면 가장 먼저 만든 테넌트에 등록한다.

### 10.3 공개 다운로드 주소

앱이 없는 상담원은 인증 토큰이 없어 자동 업데이트 경로로 못 받는다. 로그인 없는 다운로드 자리를 연다 (`deploy/agent-downloads/default.conf` — GET 만, IP 당 동시 3개).

`compose.prod.yml` 에 추가:

```yaml
  agent-downloads:
    image: nginx:1.27-alpine
    container_name: kaster-${SITE_CODE}-agent-downloads
    restart: unless-stopped
    volumes:
      - ../../agent-downloads/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ${AGENT_ARTIFACT_DIR:-./agent-artifacts}:/srv/downloads:ro
    ports:
      - "5175:80"
```

앞단 프록시에서 `https://<상담원>/downloads/` 같은 경로로 붙이거나, 사내망에서만 `http://<서버IP>:5175/KAsterAgent-Setup.exe` 로 안내한다. 이 고정 이름은 항상 최신 버전을 가리킨다.

### 10.4 상담원 PC

사용 매뉴얼 2.1~2.3 을 그대로 따른다. 요약: 받기 → 실행(관리자 권한 불필요) → 서버 설정에 `https://<API>` → 로그인 → 소프트폰이면 전화기 표시등 초록, 책상 전화기면 화면의 SIP 값을 전화기에 입력.

---

## 11. 단계 9 — PBX 설정 첫 적용

관리자 콘솔에서 아래 순서로 넣는다. **"저장"은 DB 에만 들어가고, 마지막의 "적용"이 PBX 에 쓴다** (호 분배룰만 저장 즉시 반영).

| 순서 | 메뉴 | 넣을 것 |
|---:|---|---|
| 1 | 시스템 설정 | 전화기 SIP 등록 포트 48950 · 사이트 기본 SIP 비밀번호 · 기본 발신번호 · 허용 발신번호 · 녹취 사용/채널 방식(AI 분석을 쓰려면 스테레오) · 타임존 |
| 2 | PBX 설정 > 트렁크 | 통신사 스펙대로. 인증 방식(REGISTER / IP 인증)에 따라 인증 사용 여부. 코덱 `alaw,ulaw`. 표시번호 |
| 3 | PBX 설정 > 트렁크 > 국선 그룹 | 트렁크를 넣고 기본 발신 그룹 켜기 |
| 4 | 지사 관리 | 지사 1개 이상, 지사 기본 발신번호 |
| 5 | 상담원 설정 | 시험용 상담원 2명(내선 2개) 이상. 역할 agent |
| 6 | 호 분배룰 설정 | 큐 1개, 멤버에 상담원 2명, 수락 대기시간(제안을 쓸지) |
| 7 | 멘트 관리 | 한국어 멘트 업로드 (11.1) |
| 8 | PBX 설정 > DID | **검증용 DID 1개**만 먼저. 연결 방식 큐 직결 → 6번 큐 |
| 9 | PBX 설정 > .conf 미리보기 / dry-run | "Dry-run 검증 통과" 확인 → **변경 내역** 열람 → **적용** |
| 10 | PBX 호스트 | `sudo systemctl restart asterisk` — **첫 적용은 SIP 전송(포트) 바인딩이 새로 생기므로 reload 로는 안 된다** |
| 11 | PBX 설정 > 내선 SIP | 시험 상담원 내선이 "등록됨" |

### 11.1 한국어 멘트

기본 인바운드 흐름(차단 번호 안내 · 080 수신거부 · ARS 안내 등)은 한국어 멘트 13개를 가리킨다. 파일은 저장소에 없고 Windows 음성엔진(ko-KR)으로 만든다.

```powershell
pwsh tools\make-korean-prompts.ps1        # 8kHz/16bit/mono WAV 13개
```

만든 파일을 관리자 콘솔 > 멘트 관리에서 하나씩 업로드한다 (파일명이 dialplan 이 찾는 이름과 같아야 한다 — 스크립트가 만든 이름 그대로). 업로드하면 서버가 `/var/lib/asterisk/sounds/custom/` 에 놓는다. Smart ARS 용 4개(`smart_ars_*.wav`)는 4.3 에서 이미 복사했다.

### 11.2 적용 뒤 PBX 에서 볼 것

```bash
sudo asterisk -rx "pjsip show transports"      # transport-udp 0.0.0.0:48950 (+ 트렁크 전송)
sudo asterisk -rx "pjsip show endpoints"       # 트렁크 + 내선들
sudo asterisk -rx "pjsip show contacts"        # 등록된 전화기
sudo asterisk -rx "queue show"                 # 큐와 멤버
sudo asterisk -rx "dialplan show inbound-main" # DID 가 있는가
ls -l /var/lib/asterisk/sounds/custom/kaster-*  # 훅 스크립트 3~4개, 실행 권한
```

---

## 12. 단계 10 — 검증 통화

[`2026-08-10-installation-scenario-prep-checklist.md`](2026-08-10-installation-scenario-prep-checklist.md) 14장의 12항목을 그대로 쓴다. 특히 아래는 개발서버 검증에서 실제로 걸렸던 것이다.

| # | 시험 | 통과 기준 | 걸렸던 것 |
|---:|---|---|---|
| 1 | 휴대폰 → 검증 DID | 큐 → 상담원 제안/벨 → 통화 | 인바운드 첫 단계가 ANI 차단이다. 시험 번호가 블랙리스트에 있으면 `blocked-ani` 로 빠진다 |
| 2 | 양방향 음성 10초 | 양쪽 다 들림 | 한쪽만 들리면 `ASTERISK_EXTERNAL_MEDIA_ADDRESS` (NAT) · RTP 포트 |
| 3 | 소프트폰 등록 후 5분 방치 → 인입 | 벨 울림 | 라우터 UDP 핀홀 — 렌더 기본 `qualify_frequency=30` 이 적용됐는지 |
| 4 | 전화기 강제 종료 → 재등록 | 403 없이 등록 | `remove_existing=yes` |
| 5 | 상담원 → 휴대폰 발신 | 트렁크로 나가고 발신번호가 맞음 | 발신번호 정책, 국선 그룹 |
| 6 | 돌려주기(협의) → 취소 → 원 통화 복귀 | 복귀 | |
| 7 | 통화 종료 → 녹취 목록에 파일 → 재생 | 재생됨 | 녹취 경로 마운트 |
| 8 | 상담원 앱 종료 → 인입 | 그 자리로 안 감 | presence pause |
| 9 | 15분 이상 로그인 유지 | 끊김 없음 (토큰 회전) | |
| 10 | 관리자 > 호 로그 | 1번 통화의 AMI 이벤트 흐름 | |
| 11 | CID 프로그램 (쓰는 경우) | 통화 종료 시 레코드 수신 | 포트 |
| 12 | `GET /api/v1/health` | 전부 정상 | |

결과는 `docs/qa/deploy-YYYYMMDD-<사이트>.md` 로 남긴다 (증적 목록은 준비 체크리스트 17장).

---

## 13. 단계 11 — 백업과 인수

```bash
# DB 백업 (매일 03:00 예시) — deploy-prod.sh 가 배포 때마다 같은 형식으로 backups/ 에 남긴다
0 3 * * * cd /opt/kaster_cti/deploy/sites/<사이트코드> && docker compose -f compose.prod.yml --env-file .env exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip -c > backups/postgres-$(date +\%Y\%m\%d).sql.gz \
  && date -Iseconds > /var/lib/kaster/backup-status
```

`.env` 에 `RESILIENCE_BACKUP_STATUS_FILE=/var/lib/kaster/backup-status` 를 넣고 compose 에 넘기면 시스템 모니터링에 "마지막 백업" 이 보인다.

녹취(`/var/spool/asterisk/monitor`)와 `/etc/asterisk` 는 별도 백업 대상이다. 녹취 암호화를 켠 사이트는 **키 없는 백업은 백업이 아니다.**

인수 때 넘길 것: `.env` 사본(금고), `compose.prod.yml`, 마커 값, 통신사 스펙, 12장 결과, 사용 매뉴얼 8장(설계와 다른 것).

---

## 14. 자주 막히는 곳

| 증상 | 원인 | 조치 |
|---|---|---|
| `docker compose build` 가 베이스 이미지 조회에서 멈춘다 | Docker Hub 차단 | 5.4 파일 반입 |
| 배포 스크립트가 `placeholder/default secret remains` | `.env` 에 기본값 | 1장 값으로 교체 |
| `PBX config owner marker mismatch` | 마커 ≠ `SITE_CODE` | 4.4. 이 서버가 주인이 맞을 때만 마커를 바꾼다 |
| 서버 로그 `AMI login failed` | `manager.conf` secret/permit | 4.2. permit 에 Docker 브리지 대역 |
| PBX 설정 적용 뒤 전화기가 옛 포트로만 붙는다 | 포트 변경은 reload 로 안 됨 | `systemctl restart asterisk` |
| `Newchannel → DialBegin` 이 20초 | 닿지 않는 STUN | `ASTERISK_RTP_STUN_ADDRESS` 비우기 |
| 관리자 화면 Network Error | 번들에 `localhost:3000` | 8장 검증 |
| `.env` 를 바꿨는데 컨테이너에 안 들어간다 | compose 가 변수를 하나씩 넘긴다 | compose 에 줄 추가 + `up -d` (`restart` 아님) |
| 상담원 "설치 파일 받기" 404 | 서버 컨테이너가 `agent-artifacts` 를 못 본다 | 10.2 스크립트의 가시성 확인 단계 |
| 시드가 두 번 돌아 데모 통화가 늘었다 | `AUTO_SEED_DEMO_DATA` 를 안 껐다 | 7.2 |
| 부팅 로그에 "테넌트 부트스트랩" 이 안 나온다 | env 넷 중 하나가 비었거나 테넌트가 이미 있다 | 7.1 |
| 멘트가 영어로 나온다 | 한국어 멘트 미업로드 | 11.1 |
| 타사 CID 에 레코드가 안 온다 | 포트 미공개 | 5.3 `ports` |

---

## 15. 이 매뉴얼이 보장하지 않는 것

| 항목 | 상태 |
|---|---|
| 운영 사이트 리허설 | 없음. 첫 사이트가 리허설이다 |
| PBX 별도 호스트 | 컨테이너가 `/etc/asterisk` 를 마운트할 수 없다. NFS 마운트 + Asterisk 환경변수 `KASTER_OPT_OUT_API_BASE_URL` · `KASTER_SMART_ARS_API_BASE_URL` 로 훅 주소를 바꾸는 구성이 이론상 가능하나 **검증된 적 없다** |
| 이중화 (PBX 2대 · CTI 2노드 · Postgres HA · Redis Sentinel) | 설계([`../design/operations-architecture.md`](../design/operations-architecture.md))와 runbook 만 있다. 멀티노드 리더 선출은 코드에 있으나 운영 실행 기록이 없다 |
| TLS | 앞단 종료 전제. 컨테이너 nginx 는 80 만 |
| 운영 통신사 회선 | 개발서버 회선(KCT 070)만 확인 |
| 에코 · 큐 오버플로 · 녹취 암호화 재생 · ARS 플로우 실통화 · AI 분석 실녹취 | 실 PBX 미검증 — 처음 켤 때 검증용 DID 로 |
| 7.1 테넌트 부트스트랩 · 5.3 템플릿 | 단위 테스트와 `compose config` 렌더링만 확인. 실 사이트 첫 부팅 리허설 없음 |
| `install/install.sh` 전체 실행 | CI 가 ubuntu-22.04 러너에서 system·site·asterisk 단계까지 실제로 돌린다. deploy·verify 를 포함한 끝까지의 실행과 오프라인 번들은 **실 서버에서 리허설된 적 없음** |
| 7.3 SQL | 개발서버에서 실행해 본 적 없음 |

---

## 관련 문서

- 설치 전 입력값 체크리스트: [`2026-08-10-installation-scenario-prep-checklist.md`](2026-08-10-installation-scenario-prep-checklist.md)
- 운영 배포 표준: [`production-deployment-standard.md`](production-deployment-standard.md) · 사이트 템플릿 [`../../deploy/sites/_template/README.md`](../../deploy/sites/_template/README.md)
- DB 마이그레이션: [`db-migration-runbook.md`](db-migration-runbook.md) · 이미지를 안 만드는 배포: 같은 문서 7장
- PBX 설정 반영: [`pbx-config-apply-runbook.md`](pbx-config-apply-runbook.md)
- SIP 보안: [`2026-08-02-pbx-sip-security-hardening-runbook.md`](2026-08-02-pbx-sip-security-hardening-runbook.md)
- 실 PBX 검증 기록 (걸렸던 것들의 원본): [`../qa/2026-08-20-csharp-softphone-phase1-verification.md`](../qa/2026-08-20-csharp-softphone-phase1-verification.md)
- 사용 매뉴얼: [`2026-09-03-user-manual-runbook.md`](2026-09-03-user-manual-runbook.md)
- 갭 분석 (이 매뉴얼이 우회하는 제품 공백의 근거): [`../design/2026-09-03-design-vs-implementation-gap-analysis.md`](../design/2026-09-03-design-vs-implementation-gap-analysis.md)
