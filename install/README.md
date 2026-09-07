# install/ — 단일 서버 설치 스크립트

새 서버에 PBX(Asterisk) + CTI 컨테이너 + 첫 계정 + 방화벽을 한 번에 세운다.
단계별 설명과 설치 뒤 할 일(트렁크·DID·검증 통화)은
[`docs/operations/2026-09-03-site-installation-guide-runbook.md`](../docs/operations/2026-09-03-site-installation-guide-runbook.md) 에 있다.

```bash
git clone <저장소> /opt/kaster_cti && cd /opt/kaster_cti
sudo install/install.sh --wizard                    # 질문에 답하면 install/site.conf 를 만들고 바로 설치
# 또는
cp install/site.conf.example install/site.conf && nano install/site.conf
sudo install/install.sh --config install/site.conf
```

| 파일 | 역할 |
|---|---|
| `install.sh` | 진입점. 단계 `system → site → asterisk → firewall → deploy → verify`. `--only` `--from` `--skip` `--dry-run` |
| `site.conf.example` | 답안 파일 예시. 비밀은 적지 않는다 — 스크립트가 만들어 사이트 `.env` 에만 둔다 |
| `lib/*.sh` | 단계별 함수 |
| `make-offline-bundle.sh` | 인터넷·Docker Hub 없는 서버용 번들(deb·이미지·저장소)을 인터넷 되는 PC 에서 만든다 |

## 검증된 조합만 기본 허용

공유 개발 서버(유일하게 실 PBX 로 검증된 곳, 2026-09-03 실측)와 같은 조합이 아니면 멈춘다:
**Ubuntu 22.04 · apt `asterisk` 1:18.10.0 · Ubuntu `docker.io` + `docker-compose-v2`**.
설계서의 "Asterisk 22 소스 빌드"는 실행된 적이 없다. 다른 조합을 감수하려면 `ALLOW_UNVERIFIED=true`.

## 다시 실행해도 안전한가

- `.env` 의 비밀(DB·JWT·AMI·훅)은 있으면 그대로 두고 없을 때만 만든다.
- 부트스트랩(첫 테넌트·관리자·플랫폼 관리자)은 각 테이블이 0건일 때만 동작한다. verify 가 계정을 확인하면 1회용 비밀번호를 `.env` 에서 지우고 `INSTALL-SUMMARY.txt` 에만 남긴다.
- PBX 소유 마커가 다른 사이트 이름이면 멈춘다. 남의 PBX 를 덮어쓰지 않는다.
- `manager.conf` · `http.conf` · `extensions.conf` · `extensions_transfer.conf` 는 스크립트가 소유한다 (다시 쓴다). 서버가 렌더링하는 파일(`pjsip.conf` 등)은 건드리지 않는다.

## 이 스크립트가 하지 않는 것

- 트렁크·DID·큐·상담원·멘트 등록과 PBX 설정 첫 적용 — 관리자 콘솔에서 (매뉴얼 11장).
- 한국어 멘트 13개 생성 — Windows PC 의 `tools/make-korean-prompts.ps1`.
- 상담원 데스크톱 설치 파일 빌드·등록 — `apps/desktop-win/tools/build-release.ps1` + `scripts/publish-desktop-release.sh`.
- TLS 종료 — 앞단(LB·별도 nginx)에서. `PUBLIC_SCHEME=https` 는 주소 생성에만 쓴다.
- PBX 별도 호스트 구성.

## 검증 상태

CI(`.github/workflows/ci.yml` `installer` 잡)가 ubuntu-22.04 러너에서 shellcheck 와 `--dry-run`, 그리고 `system·site·asterisk` 단계를 실제로 실행한다.
`deploy·verify` 까지 포함한 전체 설치는 **실 서버에서 리허설된 적이 없다.** 첫 사이트는 검증용 DID 로 매뉴얼 12장을 끝내기 전까지 실제 회선을 붙이지 않는다.
