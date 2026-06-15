import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { JobQueue } from "./queue.js";
import { placeSchema, type JobEvent } from "./types.js";

loadDotenv();

const PORT = Number(process.env.PORT ?? 7332);
const TOKEN = process.env.BRIDGE_TOKEN ?? "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const AGENT = (process.env.AGENT === "claude" ? "claude" : "codex") as
  | "claude"
  | "codex";
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY ?? 1));
const TIMEOUT_MS = Math.max(10_000, Number(process.env.TIMEOUT_MS ?? 180_000));

if (!TOKEN || TOKEN === "change-me-to-random-string") {
  console.error(
    "✖ BRIDGE_TOKEN 이 설정되지 않았습니다. .env 파일을 확인하세요.",
  );
  process.exit(1);
}

const queue = new JobQueue({
  agent: AGENT,
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
});

const app = new Hono();

// ── 요청 로그 (디버깅용) ────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    `${new Date().toISOString().slice(11, 19)} ${c.req.method.padEnd(6)} ${c.res.status} ${c.req.path}`,
  );
});

// ── CORS / Auth 미들웨어 ────────────────────────────────────────────────────

app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowed = matchOrigin(origin, ALLOWED_ORIGINS);

  if (allowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept",
    );
    c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    c.header("Access-Control-Max-Age", "86400");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

app.use("*", async (c, next) => {
  // 토큰 검증
  const auth = c.req.header("authorization") ?? "";
  const expected = `Bearer ${TOKEN}`;
  if (auth !== expected) {
    return c.json({ message: "unauthorized" }, 401);
  }
  await next();
});

// ── 라우트 ──────────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ ok: true, agent: AGENT, concurrency: CONCURRENCY }),
);

app.get("/jobs", (c) => c.json({ jobs: queue.list() }));

const enqueueBodySchema = z.object({ place: placeSchema });

app.post("/jobs", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = enqueueBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { message: "invalid body", issues: parsed.error.flatten() },
      400,
    );
  }
  const job = queue.enqueue(parsed.data.place);
  return c.json({ job });
});

app.delete("/jobs/:id", (c) => {
  const id = c.req.param("id");
  const removed = queue.remove(id);
  if (!removed) return c.json({ message: "not found" }, 404);
  return c.json({ ok: true });
});

app.post("/jobs/:id/submitted", (c) => {
  const id = c.req.param("id");
  const ok = queue.markSubmitted(id);
  if (!ok) return c.json({ message: "not found" }, 404);
  return c.json({ ok: true });
});

app.get("/events", (c) => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: JobEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // controller closed
        }
      };
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // closed
        }
      }, 15_000);

      const unsub = queue.subscribe(send);

      const close = () => {
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      // Hono / Node 환경에서 abort 신호 전달
      c.req.raw.signal.addEventListener("abort", close);
    },
  });

  // new Response() 로 직접 응답을 만들면 Hono 미들웨어에서 c.header() 로 추가한
  // CORS 헤더가 머지되지 않으므로, 여기서 직접 origin 검사 후 같은 헤더를 박는다.
  const origin = c.req.header("origin") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  if (matchOrigin(origin, ALLOWED_ORIGINS)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(stream, { headers });
});

// ── 시작 ────────────────────────────────────────────────────────────────────

serve(
  { fetch: app.fetch, port: PORT, hostname: "127.0.0.1" },
  ({ port }) => {
    console.log(`▶ auto-submit-bridge listening on http://127.0.0.1:${port}`);
    console.log(`  agent=${AGENT}  concurrency=${CONCURRENCY}  timeout=${TIMEOUT_MS}ms`);
    console.log(`  allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  },
);

// ── helpers ─────────────────────────────────────────────────────────────────

function matchOrigin(origin: string, patterns: string[]): boolean {
  if (!origin) return false;
  return patterns.some((pattern) => {
    if (pattern === origin) return true;
    if (pattern.includes("*")) {
      const re = new RegExp(
        "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      );
      return re.test(origin);
    }
    return false;
  });
}

function loadDotenv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
