# 실제 뉴스 연동 운영 안내

이 버전은 Worker 서버, D1 저장소, 서버 인증, Jev/LLM 어댑터와 검수·발행 화면을 갖춥니다. 실제 언론사 수집과 모델 호출은 아직 실행하지 않았습니다. 기존 샘플 108건과 연구용 링크는 운영 DB로 옮기지 않습니다.

## 코드 / Jev / LLM 분담

| 담당 | 동작 |
|---|---|
| 코드 | 공급 API 요청, 출처·날짜·권한 검사, URL/본문 동일성 중복 제거, 한국 시간 기간 계산, 저장, 실행 잠금, 재시도, 건수 제한, 기사 ID 검사, 부서 권한, 발행 |
| Jev | 제목·본문에서 보험업 관련성 Noul, 6개 부서별 Noul, 보고 가치 Score 1회 요청 |
| LLM | 선정된 원문을 읽고 제목·핵심 요약·인사이트·업무 제안을 JSON으로 작성 |
| 관리자 | 이용 범위 확인, 불확실한 분류 검토, 출처와 수치·사실·해석 확인 후 발행 |

다른 문장으로 보도된 동일 사건까지 코드로 의미 중복을 판정하지 않습니다. 현재는 URL 및 공백 정규화 본문 일치만 합칩니다. 대체 출처는 함께 보관합니다. LLM은 선정 기사 안의 반복 이슈를 묶어 서술할 수 있지만, 이것을 검증된 사건별 집계로 사용하지 않습니다.

## 연결 순서

1. **뉴스 공급 경로**를 확정합니다. 허용된 기사 JSON을 수동 등록하거나, 본문 제공 및 AI 이용이 허용된 공급 API를 등록합니다. 참고 매체 10곳의 본문을 자동으로 긁는 기능은 켜지지 않습니다.
2. 서비스 소개 → **연동 준비**에서 관리자 계정을 확인합니다. Sites 로그인 신원을 서버에서 확인하며 `ADMIN_USER_IDS` 또는 최초 소유자용 `ADMIN_EMAILS`로 지정합니다. 부서 담당자는 로그인 후 표시되는 Site 사용자 ID를 관리자에게 전달하고, 관리자가 부서를 배정합니다. 이름 선택·브라우저 저장값은 운영 권한이 아닙니다.
3. 매체별 **수집 활성화 / 본문 저장 허용 / AI 이용 허용 / 확인 근거**를 저장합니다. 기본은 전부 미허용입니다. 등록은 관리자의 확인 기록이며 자동 법률 판정이 아닙니다.
4. Sites 환경 변수에 `TYPESAFE_API_KEY`, `TYPESAFE_MODEL`, `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL`을 설정하고 배포해 적용합니다. 브라우저·Git·hosting.json에는 키를 넣지 않습니다.
5. `npm run evaluate:jev`로 평가 표본을 확인합니다. 사람이 표본 정답을 검토한 후 서버 환경에서 `npm run evaluate:jev -- --live --write-results`로 실제 Jev를 평가합니다. 실제 허용 기사도 추가해 누락·오분류를 확인하고 임계값을 조정합니다. 현재 작성한 16개 사례는 평가 출발점이며 검증 완료 인증이 아닙니다.
6. 한 회차를 수동으로 실행합니다. 분류 검토, 초안 생성, 원문 확인 후 발행, 다른 부서의 접근 차단까지 확인합니다.
7. 검증 후 자동 실행을 연결합니다. 아래 실행기는 준비했으나 이 배포에서 예약 작업을 만들거나 활성화하지 않습니다. 매일 API 설정만 해 둔다고 자동 실행되지는 않습니다.

### LLM 어댑터 범위

현재는 **OpenAI 호환 Chat Completions**의 JSON 모드 모델을 받습니다. HTTPS `LLM_API_URL`은 `/chat/completions`까지 포함한 전체 주소이고, 해당 모델이 `response_format: {type: "json_object"}`, `max_tokens`, `choices[0].message.content` 응답을 지원해야 합니다. 특정 제공업체 계정이나 모델을 임의로 선택하지 않았습니다. 호환되지 않는 공급자는 어댑터가 추가로 필요합니다. 연결 후 소량 실제 호출 검증이 필요합니다.

### 공급 API 계약

`NEWS_FEED_URL`에 `GET ?from=<UTC ISO>&to=<UTC ISO>&limit=100`을 보냅니다. 시작은 포함, 끝은 제외입니다. 키가 있으면 서버에서 `Authorization: Bearer NEWS_FEED_KEY`를 붙입니다. HTTPS 주소만 사용하고 리디렉션은 따르지 않습니다. 전체 회차를 한 번에 반환하는 계약이며, `hasMore: true` 또는 `nextCursor`가 있으면 누락 방지를 위해 저장하지 않습니다. 대규모 공급자는 페이지네이션 어댑터가 필요합니다.

```json
{
  "articles": [
    {
      "sourceId": "fins",
      "url": "https://www.fins.co.kr/news/articleView.html?idxno=실제기사번호",
      "title": "실제 허용된 기사 제목",
      "publishedAt": "2026-11-12T09:00:00+09:00",
      "body": "본문 저장 및 AI 이용 범위를 확인한 원문 텍스트 (40~20,000자)"
    }
  ],
  "hasMore": false
}
```

이는 입력 형식 설명입니다. 예시 URL을 실제 기사로 저장하지 않습니다. `sourceId`는 `insnews`, `fins`, `newsis`, `chosunbiz`, `joongang`, `chosun`, `kmib`, `mk`, `hankyung`, `yna` 중 하나입니다. 발행 시각에는 시간대를 반드시 포함합니다. URL의 원문 ID 매개변수는 유지하고 알려진 추적 매개변수만 제거합니다. 본문은 자동으로 웹사이트에서 가져오지 않습니다.

## 보고 기간과 실행

| 종류 | 입력 | 포함 기사 |
|---|---|---|
| 월요일 | 월요일 YYYY-MM-DD | 직전 목요일 00:00~월요일 00:00 직전, 한국 시간 |
| 목요일 | 목요일 YYYY-MM-DD | 월요일 00:00~목요일 00:00 직전, 한국 시간 |
| 월간 | 대상 YYYY-MM | 대상 월 1일 00:00~다음 달 1일 00:00 직전, 한국 시간 |

월간은 주간 요약을 다시 요약하지 않고 해당 달의 원문으로 생성합니다. 보고서 조회의 월은 **보고 기준일** 기준이므로 10월 월간 보고서는 11월에 표시됩니다. 아직 마감되지 않은 기간은 실행하지 않습니다.

```sh
# HTTP 요청 없는 실행 계획
npm run run:cycle -- 2026-11-16
npm run run:cycle -- 2026-10 --monthly

# 서버에서만 실제 실행. SITE_URL, JOB_TOKEN 및 필요 시 SITES_ACCESS_TOKEN 환경 변수 사용
npm run run:cycle -- 2026-11-16 --live
```

자동 실행은 이 명령을 호출하는 별도 스케줄러에 연결합니다. 월·목 07:00 KST는 일·수 22:00 UTC입니다. 월간은 다음 달 1일 07:00 KST에 전월을 전달합니다. 예약은 생성/작동 여부를 검증한 뒤 `SCHEDULE_VERIFIED=true`, 실측 평가는 별도 기록 후 `EVALUATION_APPROVED=true`로 표시합니다. 이 값만 바꿔서는 작업이 예약되거나 품질이 검증되지 않습니다.

## 실패와 예산

- 한 회차 최대 40개 입력 후보, 보고서 최대 12개 기사·본문 합계 90,000자. 본문 길이 한도로 보류한 수도 표시합니다. 40건을 넘으면 일부만 임의 처리하지 않고 차단합니다. 초기 시범 운영의 기본값이며 월간에도 적용합니다. `NEWS_MAX_CANDIDATES` 서버 설정으로 40~400건까지 확대할 수 있습니다. 모델 비용과 누락 여부를 평가한 뒤 확대합니다.
- 한 HTTP 요청에 Jev 신규 판단 최대 8건, 동시 4개. 진행 상태를 DB에 저장하고 다음 요청이 이어받습니다. UI와 실행기는 설정 한도에 맞춰 요청을 이어 실행합니다(기본 최대 6단계, 400건 설정 시 최대 51단계).
- 제목·본문·발행일·출처·모델 설정이 같으면 Jev 판단을 재사용합니다. 같은 회차·부서·파이프라인 버전의 초안/발행본이 있으면 다시 과금 호출하지 않습니다.
- 중요도 Score 1.5 이상 또는 관리자 선정 기사만 요약 후보입니다. 부서·관련성 yes 0.8 / no 0.2, 중요도 confidence 0.65는 **평가 전 임시값**입니다. 검토 대기 기사는 자동 요약에서 보류합니다. 낮은 중요도로 제외된 수와 최대 12건 때문에 제외된 수를 보여줍니다.
- API 429/5xx만 최초 요청 후 최대 2회 재시도합니다. 요청당 20초, 응답 512KB 상한이며 원인 불명 네트워크 중단은 무조건 재전송하지 않습니다. 공급 API는 30초 제한, 자동 재시도 없음입니다.
- `pending / running / draft / empty / blocked / failed` 상태를 구분합니다. 부분 성공한 분류는 보관하고, 실패가 기존 발행본을 지우지 않습니다. 초안은 삭제 후 재생성할 수 있고 발행본은 이 경로로 삭제할 수 없습니다.
- 존재하지 않는 기사 ID, 형식 오류, 잘린 LLM 응답은 초안으로 저장하지 않습니다. 기사 ID가 유효해도 내용이 사실이라는 보장은 없으므로 수동 검수가 필수입니다. 본문·제목이 바뀐 초안은 발행이 차단됩니다.

## 데이터와 접근

운영 DB에는 `articles`, `judgments`, `runs`, `reports`, `source_permissions`, `members`, `audit_log` 7개 테이블을 사용합니다. 기사·보고서는 기기 간 공유되며, 브라우저 저장소는 기존 샘플의 스크랩·관심 부서에만 사용합니다. API 응답은 캐시하지 않습니다. 원문 증거 스냅샷은 서버에 보관하고 일반 보고서 응답에는 포함하지 않습니다.

| API | 권한·역할 |
|---|---|
| GET /api/status, /api/session | 준비 상태·현재 세션; 키 값은 반환하지 않음 |
| GET /api/reports, /api/reports/:id | 등록 부서의 발행본만, 관리자는 개별 초안도 가능 |
| GET /api/admin/reports, /api/admin/runs | 관리자 보고서·실행 이력 |
| GET/PUT /api/admin/sources/:id | 매체 허용 범위 (목록 GET은 /sources) |
| POST /api/admin/import, /api/admin/collect | 허용 기사 등록·공급 API 요청 |
| POST /api/admin/run | Jev 판단 후 LLM 초안 생성, 발행 안 함 |
| GET/PUT /api/admin/review/:id | 불확실한 분류 검토 (목록 GET은 /review) |
| POST /api/admin/reports/:id/publish | 원문 검수 확인 후 발행 |
| DELETE /api/admin/reports/:id | 확인한 미발행 초안만 삭제 |
| PUT /api/admin/members/:id | 부서 배정; departmentId:null이면 회수 |
| POST /api/jobs/collect, /api/jobs/run | 서버 전용 JOB_TOKEN + Sites 서비스 접근 필요 |

브라우저 변경 요청은 같은 출처 Origin 및 JSON 형식을 검사합니다. Sites가 검증한 로그인 헤더만 신뢰하므로 이 Worker를 인증 헤더를 통제하지 않는 외부 서버에 그대로 노출하면 안 됩니다. 실제 부서 권한은 운영 API에 적용되며 샘플 데이터는 공개된 예시입니다.

## 검증의 범위

`npm test`는 SQLite 로컬 D1 어댑터와 모의 API 응답으로 날짜·중복·권한·입력·재실행·인용·오류 경로를 검사합니다. `npm run verify`는 기존 샘플 데이터 일관성을 확인합니다. 모델의 실제 분류 품질, 공급자별 본문 이용 허락, 실제 모델 과금·응답 속도는 이 테스트로 증명하지 않습니다.

참고 문서: [TypeSafe System One API](https://docs.typesafe.ai/api/system-one), [Noul](https://docs.typesafe.ai/primitives/noul), [Score](https://docs.typesafe.ai/primitives/score), [선별 후 요약 구성](https://docs.typesafe.ai/cookbooks/classifying_rag_passages), [Chat Completions 응답 계약](https://developers.openai.com/api/reference/resources/chat).
