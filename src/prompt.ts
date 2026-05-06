import type { Place } from "./types.js";
import { CAFE_TAGS } from "./types.js";

const TAG_GUIDE: Record<(typeof CAFE_TAGS)[number], string> = {
  콘센트_있음: "좌석에 콘센트가 있다는 후기/사진 발견 시",
  와이파이_있음: "와이파이 제공 명시 또는 후기 다수",
  조용함: "조용하다/공부하기 좋다 후기 다수",
  "24시간": "24시간 영업이 명확히 확인되는 경우",
  시간제한없음: "노트북 사용 시간제한 없음 명시 또는 후기 다수",
  노트북_허용: "노트북 사용 가능 명시 또는 후기 다수",
  혼잡도_낮음: "한적/널널하다 후기 다수",
  늦은영업: "23시 이후까지 영업하는 경우",
  가성비_좋음: "음료 가격 4,500원 이하 또는 가성비 좋다 후기 다수",
  자연채광: "큰 창/햇볕 잘 드는 후기·사진 다수",
  야외테라스: "야외 좌석/테라스가 있는 경우",
  반려동물_가능: "펫프렌들리 명시",
  주차_가능: "주차 가능 명시",
};

export function buildPrompt(place: Place): string {
  const tagList = CAFE_TAGS.map((t) => `"${t}"`).join(", ");
  const tagCriteria = CAFE_TAGS.map((t) => `   - ${t}: ${TAG_GUIDE[t]}`).join(
    "\n",
  );

  return `당신은 한국 카페의 정보를 웹 검색으로 조사해 JSON으로 반환하는 어시스턴트입니다.

## 대상 카페
- 이름: ${place.name}
- 도로명 주소: ${place.roadAddress || "(없음)"}
- 지번 주소: ${place.address || "(없음)"}
- 전화: ${place.phone ?? "(없음)"}
- 카카오 페이지: ${place.url ?? "(없음)"}

## 작업
1. 위 카페를 네이버/카카오/인스타/블로그 등에서 웹 검색하여 다음 정보를 수집:
   - 영업시간 (요일별 다르면 "평일 09:00-22:00 / 주말 10:00-23:00" 형식)
   - 최소주문금액 (원 단위 정수, 정보 없으면 null)
   - 100~200자 분량의 카페 소개 (분위기·좌석·특징 위주, 광고성 멘트 금지)
   - 카공 관련 태그 (아래 enum에서만 선택)

2. 카공 태그는 반드시 다음 enum 값에서만 선택:
   [${tagList}]

3. 각 태그 판단 기준:
${tagCriteria}

4. 정보가 불확실하면 태그를 넣지 말 것 (false positive 금지). 동명 카페가 있다면 주소로 정확히 매칭되는 곳만 사용.

## 출력 형식
정확히 다음 JSON 스키마로만 응답하세요. 코드펜스, 설명, 다른 텍스트 일절 금지.

{
  "hours": string | null,
  "min_order_amount": number | null,
  "description": string | null,
  "tags": string[],
  "confidence": {
    "hours": "high" | "mid" | "low",
    "tags": "high" | "mid" | "low",
    "overall": "high" | "mid" | "low"
  },
  "sources": string[]
}

- description 은 한국어. 200자 초과 금지.
- sources 는 참고한 URL 3~5개.
- 정보를 못 찾았으면 hours/description 은 null, tags 는 [] 로.
`;
}
