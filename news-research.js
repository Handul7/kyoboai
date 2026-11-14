/* Reviewed public article references for the service-introduction comparison. */
"use strict";

const newsSource = (outlet, date, url) => ({ outlet, date: `2026-${date}`, url });

const NEWS_RESEARCH = {
  coverageLabels: { life: "생보", nonlife: "손보", shared: "생·손보 공통" },
  outlets: {
    insnews: { name: "한국보험신문", type: "보험 전문지", homepage: "https://www.insnews.co.kr/", baseline: true },
    fins: { name: "보험매일", type: "보험 전문지", homepage: "https://www.fins.co.kr/", baseline: true },
    newsis: { name: "뉴시스", type: "통신사", homepage: "https://www.newsis.com/", baseline: true },
    chosunbiz: { name: "조선비즈", type: "인터넷 경제매체", homepage: "https://biz.chosun.com/", baseline: true },
    joongang: { name: "중앙일보", type: "종합일간지", homepage: "https://www.joongang.co.kr/", baseline: true },
    chosun: { name: "조선일보", type: "종합일간지", homepage: "https://www.chosun.com/", baseline: false },
    kmib: { name: "국민일보", type: "종합일간지", homepage: "https://www.kmib.co.kr/", baseline: false },
    mk: { name: "매일경제", type: "경제일간지", homepage: "https://www.mk.co.kr/", baseline: false },
    hankyung: { name: "한국경제", type: "경제일간지", homepage: "https://www.hankyung.com/", baseline: false },
    yna: { name: "연합뉴스", type: "통신사", homepage: "https://www.yna.co.kr/", baseline: false },
  },
  reports: [
    {
      date: "11/2 월", period: "10/29–11/1", from: "2026-10-29", through: "2026-11-01",
      issues: [
        { coverage: "shared", title: "금감원의 보험사 계리가정·결산 점검", departments: ["risk"], relevance: "결산 가정과 검증 절차 점검", sources: [
          newsSource("insnews", "10-29", "https://www.insnews.co.kr/news/articleView.html?idxno=93587"),
          newsSource("newsis", "10-29", "https://www.newsis.com/view/NISX20261029_0003846232"),
          newsSource("yna", "10-29", "https://www.yna.co.kr/view/AKR20261029155400002"),
        ] },
        { coverage: "shared", title: "보험사기에 연루된 종사자 29명 제재", departments: ["risk", "sales"], relevance: "모집인 내부통제와 교육 점검", sources: [
          newsSource("newsis", "10-29", "https://www.newsis.com/view/NISX20261029_0003846175"),
          newsSource("yna", "10-29", "https://www.yna.co.kr/view/AKR20261029084400002"),
        ] },
        { coverage: "nonlife", title: "KB손해보험 3분기 실적과 장기보험 손해율", departments: ["strategy", "risk"], relevance: "실적과 손해율 변화 비교", sources: [
          newsSource("newsis", "10-29", "https://www.newsis.com/view/NISX20261029_0003846720"),
        ] },
        { coverage: "life", title: "생보업계의 생산적 금융 확대와 자산운용 규제 건의", departments: ["asset", "risk"], relevance: "투자 확대와 자본 부담을 함께 검토", sources: [
          newsSource("fins", "10-30", "https://www.fins.co.kr/news/articleView.html?idxno=110366"),
          newsSource("insnews", "10-30", "https://www.insnews.co.kr/news/articleView.html?idxno=93606"),
        ] },
        { coverage: "life", title: "교보생명 변액보험 로보어드바이저에 모닝브리핑 도입", departments: ["digital", "asset"], relevance: "변액보험 고객의 투자 정보 접근 개선", sources: [
          newsSource("insnews", "10-30", "https://www.insnews.co.kr/news/articleView.html?idxno=93604"),
        ] },
        { event: "financial-group-results", coverage: "shared", title: "5대 금융지주 보험 계열사 3분기 실적", departments: ["strategy", "asset"], relevance: "계열사 실적과 투자손익 비교", sources: [
          newsSource("fins", "10-30", "https://www.fins.co.kr/news/articleView.html?idxno=110364"),
        ] },
        { coverage: "nonlife", title: "롯데손해보험 원더의 외식업 플랫폼 제휴", departments: ["sales", "digital"], relevance: "사업자 고객 접점과 제휴 채널 발굴", sources: [
          newsSource("insnews", "10-30", "https://www.insnews.co.kr/news/articleView.html?idxno=93605"),
          newsSource("hankyung", "10-30", "https://www.hankyung.com/article/202610305143P"),
        ] },
        { coverage: "nonlife", title: "시민안전보험 가입 확인과 보험금 직접 청구", departments: ["risk", "sales"], relevance: "보험금 청구 안내와 고객 접근성 점검", sources: [
          newsSource("newsis", "11-01", "https://www.newsis.com/view/NISX20261031_0003849275"),
        ] },
        { coverage: "nonlife", title: "현대해상 AI 보험 설계 도구 Hi-헬퍼 출시", departments: ["digital", "sales"], relevance: "설계사 지원 도구 비교. 한국경제에 실린 기업 제공 자료", sources: [
          newsSource("hankyung", "10-30", "https://www.hankyung.com/article/202610305021P"),
        ] },
      ],
    },
    {
      date: "11/5 목", period: "11/2–11/4", from: "2026-11-02", through: "2026-11-04",
      issues: [
        { event: "financial-group-results", coverage: "shared", title: "5대 금융지주 보험 계열사 3분기 실적", departments: ["strategy", "asset"], relevance: "순이익과 보험계약마진의 흐름 비교", sources: [
          newsSource("chosunbiz", "11-02", "https://biz.chosun.com/stock/finance/2026/11/02/R47AKX276JEG7IECS44V4FSNJ4/"),
          newsSource("fins", "11-02", "https://www.fins.co.kr/news/articleView.html?idxno=110361"),
        ] },
        { coverage: "shared", title: "예보, 부실 보험사 정리 시 고금리 계약 변경 검토", departments: ["risk", "strategy"], relevance: "부실 정리 과정의 계약자 보호와 인수 조건 검토", sources: [
          newsSource("chosunbiz", "11-02", "https://biz.chosun.com/stock/finance/2026/11/02/JNGF66HG5NHFVA6BSO57ZKCYDI/"),
        ] },
        { coverage: "nonlife", title: "하지정맥류 실손 입원심사 사전 안내", departments: ["risk", "sales"], relevance: "보상 심사 기준과 고객 사전 설명 점검", sources: [
          newsSource("insnews", "11-02", "https://www.insnews.co.kr/news/articleView.html?idxno=93577"),
        ] },
        { coverage: "shared", title: "금감원의 금융사 해킹 대응과 CEO 책임 강조", departments: ["digital", "risk"], relevance: "보안 사고 보고와 경영진 책임 체계 검토", sources: [
          newsSource("fins", "11-03", "https://www.fins.co.kr/news/articleView.html?idxno=110390"),
          newsSource("hankyung", "11-03", "https://www.hankyung.com/article/2026110336221"),
        ] },
        { coverage: "life", title: "동양생명의 치료 보장·납입면제 종신보험 출시", departments: ["product"], relevance: "종신보험의 특약과 납입면제 설계 비교", sources: [
          newsSource("insnews", "11-03", "https://www.insnews.co.kr/news/articleView.html?idxno=93640"),
          newsSource("yna", "11-03", "https://www.yna.co.kr/view/AKR20261103063800002"),
        ] },
        { coverage: "shared", title: "보험사 자사주 소각과 계열사 지분구조 변화", departments: ["asset", "strategy"], relevance: "주주환원과 계열사 출자관계 비교", sources: [
          newsSource("fins", "11-04", "https://www.fins.co.kr/news/articleView.html?idxno=110416"),
        ] },
        { coverage: "shared", title: "보험부채 계리가정 감독과 GA 위탁 위험평가 강화", departments: ["risk", "sales"], relevance: "부채 산정 검증과 위탁 판매 관리 기준 점검", sources: [
          newsSource("newsis", "11-04", "https://files.newsis.com/view/NISX20261104_0003854829"),
          newsSource("fins", "11-04", "https://www.fins.co.kr/news/articleView.html?idxno=110423"),
          newsSource("chosunbiz", "11-04", "https://biz.chosun.com/stock/finance/2026/11/04/5S4NBE2C7JFQJKHRQ4GMDCWNJQ/"),
          newsSource("yna", "11-04", "https://www.yna.co.kr/view/AKR20261104144500002"),
        ] },
        { coverage: "nonlife", title: "하나손해보험의 치매 재활·요양 보장 확대", departments: ["product"], relevance: "치매 진단 이후 재활과 돌봄 보장 비교", sources: [
          newsSource("mk", "11-02", "https://www.mk.co.kr/news/economy/12193672"),
        ] },
        { coverage: "nonlife", title: "한화손해보험의 교직원 교권침해 보장 상품", departments: ["product", "sales"], relevance: "직군별 배상책임·법률비용 보장과 제휴 채널 검토", sources: [
          newsSource("hankyung", "11-02", "https://www.hankyung.com/article/2026110211291"),
          newsSource("mk", "11-02", "https://www.mk.co.kr/news/economy/12193733"),
        ] },
        { coverage: "shared", title: "과거 유배당보험과 실손 계약의 누적 손실", departments: ["risk", "asset"], relevance: "기존 계약의 손실과 자산운용 부담 검토", sources: [
          newsSource("mk", "11-03", "https://www.mk.co.kr/news/economy/12195151"),
        ] },
        { event: "hanwha-life-2030", coverage: "life", title: "한화생명 생애자금 인출형 종신보험의 2030 가입 동향", departments: ["product", "sales"], relevance: "젊은 가입층의 보장·유동성 수요 비교. 기본군은 다음 회차에 포착", sources: [
          newsSource("yna", "11-04", "https://www.yna.co.kr/view/AKR20261104050700002"),
        ] },
      ],
    },
    {
      date: "11/9 월", period: "11/5–11/8", from: "2026-11-05", through: "2026-11-08",
      issues: [
        { coverage: "life", title: "교보생명의 금감원 소비자보호 모범사례", departments: ["risk", "digital"], relevance: "민원·분쟁과 보험금 지급 안내의 개선 사례 검토", sources: [
          newsSource("newsis", "11-05", "https://nwww.newsis.com/view/NISX20261105_0003855947"),
        ] },
        { coverage: "life", title: "신한라이프 소비자권익보호위원회 외부위원 위촉", departments: ["risk"], relevance: "민원·분쟁 심의의 독립성 점검", sources: [
          newsSource("newsis", "11-05", "https://files.newsis.com/view/NISX20261105_0003856455"),
        ] },
        { coverage: "shared", title: "보험사가 포함된 금융권 침해사고와 GA 보안 규제", departments: ["digital", "risk"], relevance: "사고 보고 체계와 위탁 채널의 보안 책임 점검", sources: [
          newsSource("fins", "11-05", "https://www.fins.co.kr/news/articleView.html?idxno=110433"),
        ] },
        { coverage: "life", title: "수수료 1200% 규제 이후 생보 GA 판매 변화", departments: ["sales"], relevance: "설계사 활동과 초회보험료 변화 추적", sources: [
          newsSource("fins", "11-06", "https://www.fins.co.kr/news/articleView.html?idxno=110442"),
        ] },
        { coverage: "shared", title: "실손 비급여 사전 설명·동의 법안과 의료계 반응", departments: ["product", "risk"], relevance: "비급여 안내와 실손 보상 운영 변화 검토", sources: [
          newsSource("fins", "11-05", "https://www.fins.co.kr/news/articleView.html?idxno=110427"),
          newsSource("fins", "11-06", "https://www.fins.co.kr/news/articleView.html?idxno=110447"),
        ] },
        { coverage: "shared", title: "예보와 보험업계의 예금보험료율 협의", departments: ["risk", "strategy"], relevance: "보험료율 변경이 비용과 자본계획에 미칠 영향 점검", sources: [
          newsSource("chosunbiz", "11-06", "https://biz.chosun.com/stock/finance/2026/11/06/CS6DXJMD5NAZNCUV5JKEXEHWIE/"),
        ] },
        { coverage: "shared", title: "초기 실손 계약의 선택형 할인과 5세대 전환 할인", departments: ["product", "sales"], relevance: "보험료와 보장 조건을 함께 설명하는 기준 검토", sources: [
          newsSource("mk", "11-06", "https://www.mk.co.kr/news/economy/12200450"),
          newsSource("joongang", "11-07", "https://www.joongang.co.kr/article/25476520"),
        ] },
        { event: "hanwha-life-2030", coverage: "life", title: "한화생명 생애자금 인출형 종신보험의 2030 가입 동향", departments: ["product", "sales"], relevance: "확장군에서는 직전 회차에 포착한 가입 동향", sources: [
          newsSource("newsis", "11-07", "https://mobile.newsis.com/view/NISX20261106_0003858277"),
        ] },
        { event: "life-capital-rate-sensitivity", coverage: "life", title: "금리 상승 시 생보 기본자본 감소 추정", departments: ["asset", "risk"], relevance: "금리 민감도와 자본 시나리오 점검. 기본군은 다음 회차에 포착", sources: [
          newsSource("mk", "11-08", "https://www.mk.co.kr/news/economy/12201658"),
        ] },
        { coverage: "nonlife", title: "카카오페이손해보험 펫보험의 위험률·보장 한도 설계", departments: ["product", "risk"], relevance: "신규 위험의 가격 산정과 보장 한도 설계 비교", sources: [
          newsSource("mk", "11-08", "https://www.mk.co.kr/news/economy/12201596"),
        ] },
      ],
    },
    {
      date: "11/12 목", period: "11/9–11/11", from: "2026-11-09", through: "2026-11-11",
      issues: [
        { coverage: "life", title: "라이나생명의 종신보험 카드납 제한 해제", departments: ["sales"], relevance: "채널별 납부 편의와 계약 유지 관행 비교", sources: [
          newsSource("fins", "11-09", "https://www.fins.co.kr/news/articleView.html?idxno=110441"),
        ] },
        { event: "life-capital-rate-sensitivity", coverage: "life", title: "금리 상승 시 생보 기본자본 감소 추정", departments: ["asset", "risk"], relevance: "확장군에서는 직전 회차에 포착한 금리 민감도 분석", sources: [
          newsSource("fins", "11-09", "https://www.fins.co.kr/news/articleView.html?idxno=110460"),
        ] },
        { coverage: "life", title: "교보라이프플래닛의 헬스케어 SaaS 국내 확대", departments: ["digital", "strategy"], relevance: "보험과 디지털 건강관리 서비스의 연계 검토", sources: [
          newsSource("fins", "11-10", "https://www.fins.co.kr/news/articleView.html?idxno=110483"),
        ] },
        { coverage: "nonlife", title: "롯데손해보험의 주차 일수 기반 자동차보험 할인 특약", departments: ["product", "digital"], relevance: "사용량 기반 할인과 데이터 활용 방식 비교", sources: [
          newsSource("newsis", "11-09", "https://nwww.newsis.com/view/NISX20261109_0003860820"),
          newsSource("mk", "11-09", "https://www.mk.co.kr/news/economy/12202156"),
        ] },
        { coverage: "nonlife", title: "대법원의 자동차 사고 대차료 산정 기준 판단", departments: ["risk"], relevance: "자동차보험 보상 기준과 분쟁 대응 검토", sources: [
          newsSource("fins", "11-09", "https://www.fins.co.kr/news/articleView.html?idxno=110457"),
          newsSource("yna", "11-09", "https://www.yna.co.kr/view/AKR20261108042500004"),
        ] },
        { coverage: "nonlife", title: "카카오페이손해보험의 운전자보험 세분화와 자녀 보장", departments: ["product", "sales"], relevance: "고객 유형별 보장과 판매 메시지 비교", sources: [
          newsSource("newsis", "11-09", "https://nwww.newsis.com/view/NISX20261109_0003861008"),
        ] },
        { coverage: "shared", title: "근로자 추정제 논의에 대한 보험설계사 채널의 대응", departments: ["sales", "risk"], relevance: "모집 조직의 계약과 비용 구조 점검", sources: [
          newsSource("newsis", "11-09", "https://nwww.newsis.com/view/NISX20261109_0003860597"),
        ] },
        { coverage: "nonlife", title: "삼성화재의 영국 보험사 캐노피우스 경영권 인수", departments: ["strategy", "asset"], relevance: "해외 보험사 투자와 사업 확장 방식 비교", sources: [
          newsSource("hankyung", "11-09", "https://www.hankyung.com/article/2026110958471"),
          newsSource("newsis", "11-10", "https://nwww.newsis.com/view/NISX20261110_0003861416"),
          newsSource("yna", "11-10", "https://www.yna.co.kr/amp/view/AKR20261110089900002"),
        ] },
        { coverage: "life", title: "경영인 정기보험 가입 리베이트 조직 적발", departments: ["risk", "sales"], relevance: "법인 보험의 모집질서와 지급 통제 점검", sources: [
          newsSource("newsis", "11-11", "https://files.newsis.com/view/NISX20261111_0003863647"),
          newsSource("joongang", "11-11", "https://www.joongang.co.kr/article/25477636"),
          newsSource("yna", "11-11", "https://www.yna.co.kr/amp/view/AKR20261111087900004"),
        ] },
        { coverage: "life", title: "신한라이프의 간병·요양·주간보호 사업 확대 구상", departments: ["strategy", "product"], relevance: "보장과 돌봄 서비스의 결합 방향 비교", sources: [
          newsSource("mk", "11-11", "https://www.mk.co.kr/news/economy/12205584"),
        ] },
        { coverage: "nonlife", title: "변협의 운전자보험 변호사 현물급부 특약 중단 요구", departments: ["risk", "product"], relevance: "법률비용 보장 설계의 규제와 분쟁 위험 점검", sources: [
          newsSource("mk", "11-11", "https://www.mk.co.kr/news/society/12204901"),
        ] },
        { coverage: "nonlife", title: "미국 로펌의 AI 에이전트 과실 배상책임보험 가입", departments: ["product", "digital"], relevance: "AI 업무 손해를 담보하는 해외 상품 사례", sources: [
          newsSource("hankyung", "11-10", "https://www.hankyung.com/article/202611107507i"),
        ] },
      ],
    },
  ],
};
