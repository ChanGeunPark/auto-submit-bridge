import { z } from "zod";

export const CAFE_TAGS = [
  "콘센트_있음",
  "와이파이_있음",
  "조용함",
  "24시간",
  "시간제한없음",
  "노트북_허용",
  "혼잡도_낮음",
  "늦은영업",
  "가성비_좋음",
  "자연채광",
  "야외테라스",
  "반려동물_가능",
  "주차_가능",
] as const;

export const cafeTagSchema = z.enum(CAFE_TAGS);
export type CafeTag = z.infer<typeof cafeTagSchema>;

export const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  roadAddress: z.string(),
  lat: z.number(),
  lng: z.number(),
  phone: z.string().optional(),
  url: z.string().optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const confidenceSchema = z.object({
  hours: z.enum(["high", "mid", "low"]),
  tags: z.enum(["high", "mid", "low"]),
  overall: z.enum(["high", "mid", "low"]),
});

export const researchedDataSchema = z.object({
  hours: z.string().nullable(),
  min_order_amount: z.number().int().nullable(),
  description: z.string().nullable(),
  tags: z.array(cafeTagSchema),
  confidence: confidenceSchema,
  sources: z.array(z.string()),
});
export type ResearchedData = z.infer<typeof researchedDataSchema>;

export type JobStatus =
  | "queued"
  | "researching"
  | "ready"
  | "failed"
  | "submitted";

export interface Job {
  id: string;
  place: Place;
  status: JobStatus;
  result?: ResearchedData;
  rawOutput?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type JobEvent =
  | { type: "snapshot"; jobs: Job[] }
  | { type: "upsert"; job: Job }
  | { type: "remove"; id: string };
