# KAster_CTI

Asterisk 기반 콜센터 CTI 프로젝트 패키지입니다.

## 포함 내용
- 프로젝트 기획서 PDF
- 실전 개발용 상세 설계서 PDF
- DB / API / Asterisk 스펙 PDF
- Git 업로드용 기본 저장소 구조
- 서버/인프라 디렉터리 골격

## 현재 패키지 상태
이 ZIP에는 현재 대화에서 실제 파일로 확보된 문서 산출물과 저장소 기본 구조가 포함되어 있습니다.
이전 대화에서 논의된 NestJS/Prisma/AMI 실행 코드 전체 파일셋은 이 워크스페이스에 개별 소스 파일로 존재하지 않아 함께 포함되지는 않았습니다.

## 권장 다음 단계
1. 이 ZIP을 압축 해제
2. Git 저장소 연결
3. 서버 코드 파일셋을 추가 생성 후 커밋

## Git 업로드 예시
```bash
git init
git remote add origin git@github.com:longbird/KAster_CTI.git
git add .
git commit -m "initial import"
git branch -M main
git push -u origin main
```
