# ChatGPT 대화 아카이브

이 디렉터리는 KAster_CTI 프로젝트를 설계·구현하는 과정에서 진행된 45개의 ChatGPT 대화를 수집·정규화한 결과물입니다. `docs/chatgpt-sessions-analysis.md` 의 분석 리포트가 이 자료를 근거로 작성됐습니다.

## 파일

| 파일 | 내용 |
|---|---|
| `conversations.json` | 45개 대화 전체 본문. 각 엔트리는 `{title, message_count, messages: [{role, text}]}` 구조. tool 메시지 345건 + user 55건 + assistant 132건 포함 |
| `preview.md` | tool 메시지 제거, assistant 메시지 1200자 컷. 사람이 읽기 쉬운 압축본 (~100KB) |
| `extract.py` | ChatGPT share 페이지의 React Router RSC flight payload 디코더. 재현용 스크립트 |

## 원본 HTML 재수집

원본 HTML 캐시는 레포 크기(~17MB) 때문에 제외되어 있습니다. 다시 받으려면:

```bash
cd docs/chatgpt-archive
python3 extract.py \
  69ddf2fd-7230-83a4-98bf-8609cbfc2505 \
  69ddf33f-d86c-83a4-b671-1452b301effc \
  ...  # conversations.json 의 키 45개
```

`extract.py` 는 `html/{share_id}.html` 에 원본을 캐시하고 `conversations.json` 을 재생성합니다.

## 인용 방법

분석 리포트나 커밋 메시지에서 특정 대화를 참조할 때는 share ID 앞 8자리(`69ddf2fd` 등)를 쓰면 됩니다. 번호(#01~#45)는 `conversations.json` 의 키 순서와 일치합니다.
