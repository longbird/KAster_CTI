# Reference PDFs

ChatGPT 세션에서 생성된 원본 PDF 산출물 중 `docs/` 의 3대 문서와 별도로 보존할
가치가 있는 것들을 모아둡니다. 최신 편집 가능한 형태는 `docs/design/*.md` 에
있으며, 여기 PDF 는 "원본 레퍼런스" 용도입니다.

## 파일

| 파일 | 내용 | 원본 대화 / MD 버전 |
|---|---|---|
| `asterisk_cti_full.pdf` | 프로젝트 개요 + 상세 설계 + DB/API/Asterisk 스펙 3건을 한 번에 묶은 합본 (5KB) | `docs/reference/01_project_overview.pdf`, `docs/reference/02_practical_design.pdf`, `docs/reference/03_db_api_asterisk_spec.pdf` 참조 |
| `callcenter_architecture_proposal.pdf` | 대리운전 콜센터의 "핫링크 vs Hybrid" 아키텍처 제안서 | conv 04 (`69ddf38c`) — 편집 가능 MD 버전은 `docs/design/hotlink-vs-hybrid-proposal.md` |

## 새 PDF 를 여기에 추가하는 기준

- ChatGPT 세션 산출물이고 MD 로 정본화된 버전이 `docs/design/` 에 따로 있지만
  원본 PDF 도 감사/검토용으로 보존이 필요할 때.
- 레포의 1급 문서(`docs/*.pdf` 최상위)와 중복이 아닐 때.
- 크기가 레포에 부담을 주지 않을 때 (대형 바이너리는 git LFS 고려).
