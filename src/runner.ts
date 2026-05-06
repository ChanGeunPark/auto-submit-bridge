import { spawn } from "node:child_process";
import { researchedDataSchema, type Place, type ResearchedData } from "./types.js";
import { buildPrompt } from "./prompt.js";

interface RunnerConfig {
  agent: "claude" | "codex";
  timeoutMs: number;
}

interface RunnerResult {
  data: ResearchedData;
  rawOutput: string;
}

export async function researchCafe(
  place: Place,
  config: RunnerConfig,
): Promise<RunnerResult> {
  const prompt = buildPrompt(place);
  const { stdout } = await runCli(prompt, config);
  const llmText = extractLlmText(stdout, config.agent);
  const json = extractJsonObject(llmText);
  const parsed = researchedDataSchema.parse(json);
  return { data: parsed, rawOutput: stdout };
}

// ── CLI spawn ───────────────────────────────────────────────────────────────

function runCli(
  prompt: string,
  { agent, timeoutMs }: RunnerConfig,
): Promise<{ stdout: string }> {
  const { command, args } = buildCliInvocation(agent);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(
        new Error(
          `CLI 타임아웃 (${timeoutMs}ms 초과). 네트워크 또는 인증 상태 확인 필요.`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `CLI 실행 실패: ${err.message}. '${command}' 가 PATH 에 있는지 확인하세요.`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `CLI exit code ${code}\nstderr: ${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      resolve({ stdout });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function buildCliInvocation(agent: "claude" | "codex"): {
  command: string;
  args: string[];
} {
  if (agent === "claude") {
    // stdin 으로 프롬프트 전달, 결과는 단일 JSON 객체로 stdout 출력
    return {
      command: "claude",
      args: [
        "-p",
        "--output-format",
        "json",
        "--permission-mode",
        "bypassPermissions",
      ],
    };
  }
  // codex exec — 인자로 프롬프트를 받음. stdin 은 사용하지 않음.
  // (codex 는 미구현 / 별도 처리 필요)
  return {
    command: "codex",
    args: ["exec", "--full-auto"],
  };
}

// ── 출력 파싱 ───────────────────────────────────────────────────────────────

function extractLlmText(stdout: string, agent: "claude" | "codex"): string {
  if (agent === "claude") {
    const trimmed = stdout.trim();
    if (!trimmed) throw new Error("CLI 가 빈 출력을 반환했습니다.");
    try {
      const parsed = JSON.parse(trimmed) as { result?: unknown; error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.length > 0) {
        throw new Error(`Claude 에러: ${parsed.error}`);
      }
      if (typeof parsed.result !== "string") {
        throw new Error(
          `예상치 못한 출력 구조: ${trimmed.slice(0, 200)}`,
        );
      }
      return parsed.result;
    } catch (err) {
      // claude 가 평문을 뱉었을 가능성 — 그대로 반환해서 다음 단계가 처리
      if (err instanceof SyntaxError) {
        return trimmed;
      }
      throw err;
    }
  }
  // codex: stdout 의 마지막 ```...``` 블록 또는 전체 텍스트
  return stdout.trim();
}

function extractJsonObject(text: string): unknown {
  const stripped = stripCodeFence(text).trim();

  // 빠른 경로: 통째로 JSON 인지
  try {
    return JSON.parse(stripped);
  } catch {
    // 본문에서 첫 { 부터 마지막 } 까지 추출 (괄호 균형)
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(
        `LLM 응답에서 JSON 을 찾지 못했습니다: ${stripped.slice(0, 300)}`,
      );
    }
    return JSON.parse(stripped.slice(start, end + 1));
  }
}

function stripCodeFence(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence?.[1] ?? text;
}
