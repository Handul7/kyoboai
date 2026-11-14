# 교보 뉴스브리핑

생명보험·손해보험 뉴스를 부서별 요약 보고서로 제공하는 대학원 프로젝트입니다. 모바일용 HTML/CSS/JS 화면과 Cloudflare Worker 서버, D1 저장소로 구성합니다.

**샘플 열람과 실제 보고서 데이터를 분리했습니다.** 서비스 소개 → 연동 준비에서 실제 서버 설정, 매체 이용 범위, 기사 등록, 분류 검토, 초안 생성·발행을 확인합니다. API 키와 뉴스 공급 경로는 아직 연결하지 않았습니다.

## 시작

Node.js 22.13 이상이 필요합니다. 실행용 npm 의존성은 없습니다.

```sh
npm run verify
npm test
npm run build
npm run dev
```

로컬 주소는 `http://127.0.0.1:4173/#process/operations`입니다. 로컬 관리자 화면은 `PREVIEW_ADMIN=true npm run dev`로 확인합니다. 이 옵션은 로컬 서버에만 있고 배포 Worker에는 포함되지 않습니다. 로컬 DB는 무시되는 `.local-data/`에 저장하며 실제 D1과 분리됩니다.

`index.html`을 직접 열면 기존 샘플을 확인할 수 있습니다. 정적 파일만 필요한 경우 `npm run build:static`을 사용합니다. 실제 로그인·저장·API 호출을 포함한 배포 대상은 `.openai/hosting.json`에 기록한 Sites 프로젝트입니다.

## 역할

- 코드: 입력·허용 출처·날짜·중복·저장·권한·실행 제어·출처 연결
- TypeSafe Jev: 제목·본문의 보험업 관련성, 보고 가치, 복수 부서 판단
- LLM: 선정 기사에 근거한 핵심 요약·인사이트·업무 제안
- 관리자: 애매한 분류와 원문·수치 검수 후 발행

월요일에는 목~일, 목요일에는 월~수 기사로 보고합니다. 월간은 해당 달 원문으로 별도 작성합니다. 보고서는 한국 시간 기준으로 계산합니다. 샘플 메뉴의 108건·4회차·월별 보고서 및 참고 뉴스 조사 자료는 실제 수집 결과와 섞이지 않습니다.

## 배포와 버전 확인

서비스는 [kyoboai.handul.dev](https://kyoboai.handul.dev/) 한 곳에서 운영하며, Sites의 Cloudflare Worker·D1에서 실행합니다. Cloudflare DNS의 `kyoboai` CNAME은 `custom-domains.chatgpt.site`를 가리킵니다. [Handul7/kyoboai](https://github.com/Handul7/kyoboai)의 `main`이 원본이며, 이전 GitHub Pages 배포는 종료했습니다.

현재 버전은 `release.json`과 모든 화면 상단에서 확인합니다. 이전 변경은 Git 이력에서 확인할 수 있습니다.

GitHub `main`을 원본으로 관리합니다. GitHub 푸시만으로 Worker가 자동 배포되는 워크플로는 아직 없습니다. 릴리스 순서는 (1) 같은 소스의 검사·빌드, (2) GitHub 저장, (3) 기존 Sites 프로젝트에 동일 파일로 버전 저장·배포, (4) 대표 주소의 `release.json`과 GitHub 파일 대조입니다. 저장소별 커밋 SHA는 달라도 되며 배포 파일 내용이 같아야 합니다. 환경 변수와 로컬 DB는 복사하지 않습니다. 다음 업데이트에서는 DNS를 바꾸지 않습니다.

팀 선택 로그인은 발표용 샘플 열람만 제어합니다. 실제 저장·검수·발행 권한은 서버 인증으로 별도 확인하며, 샘플의 관리자 선택으로 실제 관리자 권한을 얻을 수 없습니다. 비로그인 방문자는 전체 샘플 뉴스를 볼 수 있습니다.

## 실제 연결

[운영 안내](docs/OPERATIONS.md)에 환경 변수, 공급 API JSON 형식, 부서 권한, 실행기·예약 주기, 한도, 오류 복구 및 검증 범위를 정리했습니다. `.env.example`에는 변수 이름만 있습니다. 키는 Sites 서버 환경 변수에 저장하고 다시 배포해야 적용됩니다.

현재 준비한 실제 호출 어댑터는 TypeSafe System One과 JSON 모드를 지원하는 OpenAI 호환 Chat Completions입니다. 공급자와 모델을 정한 뒤 소량 실제 응답 검증이 필요합니다. 예약 작업은 아직 활성화하지 않았습니다. 뉴스 본문 사용 허락은 매체별로 별도 확인해야 합니다.

## 파일

| 경로 | 역할 |
|---|---|
| index.html / app.js / styles.css | 기존 모바일 샘플 화면 |
| operations.js | 준비 상태·실제 보고서·관리자 화면 |
| news-research.js | 참고 매체 10곳·공개 기사 비교 자료 |
| server/core.mjs | 기간·정규화·Jev 질문·결과와 보고서 검증 |
| server/providers.mjs | 서버 전용 Jev / LLM API 어댑터 |
| server/index.mjs | 권한·기사 입력·저장·검수·발행 API |
| server/config.mjs | 출처 목록·처리 한도 |
| db/ / drizzle/ | D1 스키마·추가형 마이그레이션 |
| scripts/evaluate-jev.mjs | 대표 사례의 실제 모델 평가, 기본은 무호출 |
| scripts/run-cycle.mjs | 서버 스케줄러 연결용 실행기, 기본은 무호출 |
| tests/ | 결정 규칙·모의 API·서버 권한 통합 테스트 |

조장 엘 · 조사 카밀라 · CFO 루트 · 노가다 한들

## 디자인 참고와 자산

- [교보생명 공식 홈페이지](https://www.kyobo.com/)의 모바일 화면 — 흰 배경, 명확한 위계, 둥근 버튼 참고
- [공식 CI 안내](https://www.kyobo.com/dgt/web/company-introduction/information-in-an-enterprise/brand/kyobo-ci) — 로고는 원래 비율을 유지하고 서비스명과 분리해 표시
- [공식 모바일 색상 CSS](https://resource.kyobo.com/dgt/web/mobile/common/css/color.css) — 네이비 `#121C72`, 그린 `#4DAC26`, UI 블루 `#2A81EB`
- [공식 모바일 메인 CSS](https://resource.kyobo.com/dgt/web/mobile/common/css/main_web.css) — 모바일 그린 `#008C4D`
- [공식 모바일 로고](https://resource.kyobo.com/dgt/web/mobile/common/img/common/logo_header_kyobo.png) — 변형 없이 포함
- Unsplash 사진: [건축](https://images.unsplash.com/photo-1486406146926-c627a92ad1ab), [업무](https://images.unsplash.com/photo-1450101499163-c8848c66ca85), [데이터](https://images.unsplash.com/photo-1460925895917-afdab827c52f). 기사와 직접 관련된 보도 사진은 아닙니다.

색상은 공식 모바일 웹 스타일에서 확인한 값이며 인쇄용 CI 수치를 뜻하지 않습니다. Pretendard 웹폰트만 CDN을 사용하고, 오프라인에서는 시스템 글꼴을 사용합니다.
