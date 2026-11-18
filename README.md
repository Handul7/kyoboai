# 교보 뉴스브리핑

보험업 주요 이슈를 읽고 근거 기사를 확인하는 공개 보고서 도우미입니다. 브리핑에는 원문을 대조해 작성한 이슈 보고서와 PDF가 있습니다. 발행 회차나 월을 골라 열람할 수 있습니다.

## 기간 수집과 부서 역할

1. **기간 수집**에서 한국 시간 기준 1~31일을 고릅니다. 원하는 기사 제목, 참고 매체의 HTTPS 기사 주소, 주제도 입력할 수 있습니다.
2. 서버가 Google 뉴스 검색 RSS를 날짜별로 읽고 참고 매체 10곳, 발행일, 중복 링크·제목을 확인합니다. 검색 공급처가 노출하는 후보 중 최신 180건까지 표시합니다.
3. 기간 수집에 개인 Jev API 키를 입력하면 해당 실행에만 사용합니다. 개인 키로 판단할 때는 공개 기사 제목·매체·발행일과 부서 기준만 TypeSafe로 보내고 키와 판단 결과를 저장하지 않습니다. 개인 키를 비웠을 때 서버에 `TYPESAFE_API_KEY`가 있으면 Jev가 관련성과 보고 가치, 입력한 부서와의 업무 관련성을 판단합니다. 키가 없거나 호출이 실패하면 수집된 기사와 해당 단계의 상태를 표시합니다.
4. **부서 역할**에서 부서 이름, 담당 업무, 키워드를 편집합니다. 기준은 방문자의 브라우저에 저장되고 다음 판단에 사용됩니다. 기사와 발행본은 로그인 없이 열람합니다.

월요일은 목~일, 목요일은 월~수 기사를 오전 7시 기준으로 묶습니다. 수동 실행은 정기 발행 설정을 변경하지 않습니다. 공개 검색에서는 제목·매체·발행일·링크를 사용합니다. 본문 이용이 승인되어 저장된 기사와 정확히 일치할 때만 해당 본문을 Jev에 함께 제공합니다. 기간 검색은 새 LLM 보고서를 자동 발행하지 않습니다.

## 실행

Node.js 22.13 이상으로 `npm test`, `npm run build`, `npm run dev` 순서로 실행합니다. 로컬 주소는 `http://127.0.0.1:4173/#collect`입니다. 로컬 DB는 `.local-data/`에 저장합니다. 정적 화면은 `npm run build:static`으로 빌드할 수 있습니다. 기간 수집과 Jev는 Worker와 D1을 사용합니다.

## 배포

서비스는 [kyoboai.handul.dev](https://kyoboai.handul.dev/) 한 곳에서 운영하며, Sites의 Cloudflare Worker·D1에서 실행합니다. Cloudflare DNS의 `kyoboai` CNAME은 `custom-domains.chatgpt.site`를 가리킵니다. [Handul7/kyoboai](https://github.com/Handul7/kyoboai)의 `main`이 원본이며, 이전 GitHub Pages 배포는 종료했습니다.

현재 버전은 `release.json`과 모든 화면 상단에서 확인합니다. 이전 변경은 Git 이력에서 확인할 수 있습니다.

GitHub `main`을 원본으로 관리합니다. GitHub 푸시만으로 Worker가 자동 배포되는 워크플로는 아직 없습니다. 릴리스 순서는 (1) 같은 소스의 검사·빌드, (2) GitHub 저장, (3) 기존 Sites 프로젝트에 동일 파일로 버전 저장·배포, (4) 대표 주소의 `release.json`과 GitHub 파일 대조입니다. 저장소별 커밋 SHA는 달라도 되며 배포 파일 내용이 같아야 합니다. 환경 변수와 로컬 DB는 복사하지 않습니다. 다음 업데이트에서는 DNS를 바꾸지 않습니다.

조장 엘 · 조사 카밀라 · CFO 루트 · 노가다 한들

## 디자인 참고와 자산

- [교보생명 공식 홈페이지](https://www.kyobo.com/)의 모바일 화면 — 흰 배경, 명확한 위계, 둥근 버튼 참고
- [공식 CI 안내](https://www.kyobo.com/dgt/web/company-introduction/information-in-an-enterprise/brand/kyobo-ci) — 로고는 원래 비율을 유지하고 서비스명과 분리해 표시
- [공식 모바일 색상 CSS](https://resource.kyobo.com/dgt/web/mobile/common/css/color.css) — 네이비 `#121C72`, 그린 `#4DAC26`, UI 블루 `#2A81EB`
- [공식 모바일 메인 CSS](https://resource.kyobo.com/dgt/web/mobile/common/css/main_web.css) — 모바일 그린 `#008C4D`
- [공식 모바일 로고](https://resource.kyobo.com/dgt/web/mobile/common/img/common/logo_header_kyobo.png) — 변형 없이 포함
