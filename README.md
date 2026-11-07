# 교보 뉴스브리핑

- 사이트: https://kyoboai.handul.dev/
- GitHub 저장소: https://github.com/Handul7/kyoboai
- 호스팅: GitHub Pages (`main` / 저장소 루트)
- 도메인 DNS: Cloudflare, `kyoboai` CNAME → `handul7.github.io`

**보험 관련 뉴스를 부서별로 나누어 요약본과 인사이트를 제공하는 서비스**의 대학원 과제용 HTML 프로토타입입니다. 모바일 열람을 우선 설계했고, 교보생명 공식 모바일 홈페이지를 참고했습니다.

실제 수집·Jev 분류·LLM 분석을 마쳤다는 가정으로 샘플 데이터를 준비했습니다. API, 스크래핑, 자동 수집은 실행하지 않으며, 교보생명이 운영하는 공식 서비스가 아닙니다.

## 메인 기능

화면은 **부서 선택 → 보고서 목록 → 요약 보고서**의 세 단계입니다.

비로그인 첫 화면은 전체 뉴스입니다. 팀 선택 로그인 후에는 우리 팀의 주차·회차별 보고서 목록으로 이동하며, 관리자는 6개 팀의 목록에서 시작합니다. 보고서를 선택하면 요약과 인사이트가 열립니다. 지난 보고서 찾기를 펼쳐 월과 날짜를 설정할 수 있습니다.

각 부서의 세부 레포트는 다음 순서로 읽습니다.

1. 핵심 요약
2. 주요 인사이트
3. 부서의 업무 시사점
4. 뉴스 출처와 근거 기사

상단 로그인 버튼에서 6개 팀 중 하나를 선택하면 해당 팀의 보고서만 화면에 표시합니다. 아래의 **관리자로 로그인하기**는 전체 팀을 표시합니다. 비로그인 첫 화면은 전체 뉴스이며, 로그아웃하면 보고서 본문을 지우고 전체 뉴스로 돌아갑니다. 선택한 팀은 현재 탭의 `sessionStorage`에 저장됩니다.

전체 뉴스는 보조 화면으로 제공합니다. 검색·부서 필터·정렬·기사 상세·스크랩·텍스트 내보내기·관심 부서 설정을 체험할 수 있습니다.

## 보고 주기

| 보고 | 수집하는 뉴스 범위 | 기본 보고 시간 |
| --- | --- | --- |
| 월요일 보고 | 목·금·토·일 | 월요일 오전 7시, 한국 시간 |
| 목요일 보고 | 월·화·수 | 목요일 오전 7시, 한국 시간 |

보고서는 `11월 1주차 · 1회`와 같은 주차·회차와 발행일로 표시하며 발행 월, 시작일, 종료일로 조회합니다. 같은 주의 월요일을 기준으로 주차를 정해 1회·2회를 묶습니다. 두 주간의 샘플 기사 **108건**, 네 회차 × 6개 팀의 **보고서 24개**를 제공합니다. 이전 주 데이터는 기존 예시를 재구성했습니다. 한 기사는 여러 팀과 연결될 수 있습니다.

## 실행 및 GitHub Pages

**`index.html`을 바로 열면 됩니다.** 설치, 빌드, API 키가 필요하지 않습니다. 로컬 서버를 사용하려면 다음 명령을 실행합니다.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

`http://127.0.0.1:4173`에서 확인할 수 있습니다. 스크랩과 관심 부서는 현재 브라우저의 `localStorage`에 저장됩니다.

GitHub Pages는 **Settings → Pages → Deploy from a branch → main / (root)**로 설정합니다. `main`에 푸시하면 자동으로 사이트가 갱신됩니다. `CNAME` 파일의 `kyoboai.handul.dev`를 유지하세요. Cloudflare에는 해당 호스트의 CNAME만 설정하며 다른 서비스의 DNS는 변경하지 않습니다. 자산은 상대 경로를 사용하므로 저장소 이름이 포함된 주소에서도 동작합니다.

Node.js가 있으면 `npm run build`로 `dist/`를 만들 수도 있습니다. `npm install`은 필요하지 않습니다. 빌드 시 수집 요일, 기사 중복, 부서별 출처와 요약 근거, 보고서 ID와 권한 범위를 검사하고 JSON 데이터를 정리합니다. `npm run verify`로 검증만 실행할 수도 있습니다.

## 파일 구조

```text
index.html               화면 구조
styles.css               반응형 스타일과 교보생명 참고 테마
app.js                   화면 전환·보고 선택·검색·스크랩
data.js                  기사·분류·요약·분석·보고 회차의 샘플 데이터
data/sample-week.json    후속 API 설계에 쓸 수 있는 정리된 데이터
assets/                  공식 로고 원본과 뉴스 분위기용 사진
scripts/build-static.mjs 정적 빌드·샘플 JSON 정리
scripts/verify-prototype.mjs 기간·분류·출처·보고서 메타데이터 검증
docs/VERIFICATION.md    검증 내역과 검증 범위
```

기사 제목·본문·매체명·분류 근거·요약·분석은 작성한 예시입니다. 실제 보도가 아니며 실제 모델을 호출한 결과도 아닙니다. 원문 URL은 아직 연결하지 않았고, 출처 목록의 기사를 누르면 샘플 본문과 분류 근거를 보여줍니다. 실제 연동 시 수집 매체와 원문 링크를 연결하면 됩니다.

## 추후 실제 연동

1. 서버에서 월·목요일에 해당 기간의 주요 보험 기사를 수집합니다. 제목·본문·매체명·원문 URL·발행 시각을 저장하고 중복을 제외합니다.
2. Jev가 기사 제목과 본문을 바탕으로 관련 부서를 판단합니다. 여러 부서에 연결할 수 있고 불확실한 판단은 검토 상태로 남깁니다. 대표 기사로 성능을 평가하고 임계값을 결정합니다.
3. LLM이 보고 회차·부서별 기사 묶음을 요약하고 인사이트와 업무 시사점을 작성합니다. 분석의 근거 기사 ID도 함께 저장합니다.
4. 이 HTML 화면의 샘플 데이터 부분을 서버 API 응답으로 교체합니다.

정확한 기간 계산, 중복 제거, 수집 실행과 저장은 코드가 담당합니다. **TypeSafe와 LLM API 키는 서버 환경 변수에만 보관하며 GitHub 저장소나 브라우저 코드에 넣지 않습니다.**

TypeSafe 참고: [공식 문서](https://docs.typesafe.ai/llms.txt), [System One API](https://docs.typesafe.ai/api/system-one).

## 향후 사용자별 열람 권한

`REPORT_PUBLICATIONS`에 부서별 보고서를 별도 레코드로 두었습니다. 각 레코드는 다음 필드를 가집니다.

- `id`: 보고서 고유 ID
- `departmentId`: 소유 부서 ID
- `collectionId`: 발행 회차 ID
- `publishedAt`: 발행일
- `weekId`: 주간 회차 ID
- `access.audienceDepartmentIds`: 향후 허용할 부서의 범위
- `access.enforcement`: `client_demo`

보고서 주소는 `#department/strategy`와 `#report/sample-week-01-strategy-monday`처럼 팀 목록과 개별 보고서를 구분합니다. 이전의 `#report/strategy/monday` 주소도 지원합니다. 화면 이동, 직접 주소, 기사에서 보고서 열기 모두 선택한 팀을 검사합니다. **팀 선택은 체험용이며 실제 인증이나 서버 권한 검사는 없고 샘플 데이터는 브라우저에 모두 포함됩니다.** 앞으로 서버에서 로그인 사용자와 열람 허용 부서를 조회하고 목록·본문·출처·다운로드 요청을 각각 검사해야 합니다. 클라이언트의 부서 ID나 화면 숨김을 권한 증명으로 사용하지 않습니다.

`PIPELINE_METADATA`에는 수집·분류·분석이 실제 실행 결과가 아니라 `fixture`임을 명시했습니다. Jev는 향후 제목·본문에 대해 부서별 Noul 판단을 수행하고, 코드가 검토 상태와 복수 부서 연결을 결정하는 구성을 권장합니다. 현재 분류 근거 문장은 작성한 샘플이며 Jev가 생성한 설명이 아닙니다. [Noul 공식 문서](https://docs.typesafe.ai/primitives/noul)

검증 결과와 한계는 [검증 내역](docs/VERIFICATION.md)에 정리했습니다.

## 디자인 참고와 자산

- [교보생명 공식 홈페이지](https://www.kyobo.com/)의 모바일 화면 — 흰 배경, 명확한 위계, 둥근 버튼 참고
- [공식 CI 안내](https://www.kyobo.com/dgt/web/company-introduction/information-in-an-enterprise/brand/kyobo-ci) — 로고는 원래 비율을 유지하고 서비스명과 분리해 표시
- [공식 모바일 색상 CSS](https://resource.kyobo.com/dgt/web/mobile/common/css/color.css) — 네이비 `#121C72`, 그린 `#4DAC26`, UI 블루 `#2A81EB`
- [공식 모바일 메인 CSS](https://resource.kyobo.com/dgt/web/mobile/common/css/main_web.css) — 모바일 그린 `#008C4D`
- [공식 모바일 로고](https://resource.kyobo.com/dgt/web/mobile/common/img/common/logo_header_kyobo.png) — 변형 없이 포함
- Unsplash 사진: [건축](https://images.unsplash.com/photo-1486406146926-c627a92ad1ab), [업무](https://images.unsplash.com/photo-1450101499163-c8848c66ca85), [데이터](https://images.unsplash.com/photo-1460925895917-afdab827c52f). 기사와 직접 관련된 보도 사진은 아닙니다.

색상은 공식 모바일 웹 스타일에서 확인한 값이며 인쇄용 CI 수치를 뜻하지 않습니다. Pretendard 웹폰트만 CDN을 사용하고, 오프라인에서는 시스템 글꼴을 사용합니다.
