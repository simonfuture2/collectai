// Central Claude routing. All Anthropic calls go through callClaude.
// Override any model via env (e.g. CLAUDE_MODEL_PRICING=claude-opus-5-5).

export type ClaudeTask =
  | "PRICING_ANALYSIS"
  | "PRICE_VERIFY"
  | "PRE_GRADE"
  | "QUICK_SCAN"
  | "DEMO_SCAN"
  | "IDENTIFY_FALLBACK";

interface ModelConfig {
  model: string;
  effort: "low" | "medium" | "high";
  max_tokens: number;
}

const env = (k: string) => Deno.env.get(k) || undefined;

export const MODELS: Record<ClaudeTask, ModelConfig> = {
  PRICING_ANALYSIS: { model: env("CLAUDE_MODEL_PRICING") ?? "claude-sonnet-5-5", effort: "medium", max_tokens: 16000 },
  PRICE_VERIFY: { model: env("CLAUDE_MODEL_VERIFY") ?? "claude-sonnet-5-5", effort: "low", max_tokens: 4000 },
  PRE_GRADE: { model: env("CLAUDE_MODEL_GRADE") ?? "claude-sonnet-5-5", effort: "medium", max_tokens: 12000 },
  QUICK_SCAN: { model: env("CLAUDE_MODEL_QUICK") ?? "claude-sonnet-5-5", effort: "low", max_tokens: 4000 },
  DEMO_SCAN: { model: env("CLAUDE_MODEL_QUICK") ?? "claude-sonnet-5-5", effort: "low", max_tokens: 4000 },
  IDENTIFY_FALLBACK: { model: env("CLAUDE_MODEL_IDENTIFY") ?? "claude-sonnet-5-5", effort: "low", max_tokens: 6000 },
};

const FALLBACK_MODEL = () => env("CLAUDE_MODEL_FALLBACK") ?? "claude-sonnet-4-6";

export class ClaudeError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Claude API error: ${status} — ${body}`);
    this.status = status;
    this.body = body;
  }
}

export interface CallClaudeArgs {
  task: ClaudeTask;
  system?: string;
  messages: unknown[];
  cacheSystem?: boolean;
}

export interface ClaudeResult {
  text: string;
  usage: any;
  model: string;
  stopReason: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callClaude({ task, system, messages, cacheSystem }: CallClaudeArgs): Promise<ClaudeResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new ClaudeError(500, "ANTHROPIC_API_KEY not configured");
  const cfg = MODELS[task];

  const send = (model: string) => {
    const body: Record<string, unknown> = {
      model,
      max_tokens: cfg.max_tokens,
      output_config: { effort: cfg.effort },
      messages,
    };
    if (system) {
      body.system = cacheSystem
        ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
        : system;
    }
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  };

  const started = Date.now();
  let model = cfg.model;
  let res = await send(model);
  let retried = false;
  let fellBack = false;

  for (;;) {
    if (res.ok) break;
    const errText = await res.text().catch(() => "");
    const transient = res.status === 429 || res.status === 529 || res.status >= 500;
    const modelProblem = res.status === 404 || (res.status === 400 && /model/i.test(errText));
    if (transient && !retried) {
      retried = true;
      console.warn(`[claude] task=${task} status=${res.status} — retrying in 1.5s`);
      await sleep(1500);
      res = await send(model);
      continue;
    }
    if (modelProblem && !fellBack) {
      fellBack = true;
      const fb = FALLBACK_MODEL();
      console.warn(`[claude] task=${task} model=${model} rejected (${res.status}: ${errText.slice(0, 200)}) — falling back to ${fb}`);
      model = fb;
      res = await send(model);
      continue;
    }
    console.error(`[claude] task=${task} model=${model} failed status=${res.status} body=${errText.slice(0, 500)}`);
    throw new ClaudeError(res.status, errText);
  }

  const data = await res.json();
  const text = (Array.isArray(data?.content) ? data.content : []).find((b: any) => b?.type === "text")?.text ?? "";
  const stopReason = data?.stop_reason ?? null;
  const usage = data?.usage ?? {};
  if (stopReason === "max_tokens") console.error(`[claude] task=${task} hit max_tokens (${cfg.max_tokens})`);
  console.log(
    `[claude] task=${task} model=${data?.model ?? model} in=${usage.input_tokens ?? 0} out=${usage.output_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} ms=${Date.now() - started}`,
  );
  return { text, usage, model: data?.model ?? model, stopReason };
}

export function parseJsonFromText(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in text");
  return JSON.parse(src.slice(start, end + 1));
}
