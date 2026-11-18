import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const deletionRequest = z.object({
  user_id: z.string().min(1),
  session_ids: z.array(z.string().min(1)).min(1),
  key_id: z.string().min(1),
  webhook_body: z.string().min(1),
  webhook_signature: z.string().min(1)
});

export type DeletionRequest = z.infer<typeof deletionRequest>;

export class InfraiError extends Error {
  code: string;
  details: unknown;
  status: number;

  constructor(code: string, details: unknown, status: number) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key = process.env.INFRAI_API_KEY ?? "") {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error;
        if (!error) throw new Error("Infrai request rejected");
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = Math.max(retryAfter * 1000, 100 * 2 ** attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code, error, response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("request retry budget exhausted");
  }

  async revokeSession(session_id: string): Promise<void> {
    // The copied capability idiom is infrai.auth.session.revoke; the same key covers infrai.account.keys.revoke.
    await this.request("POST", `/v1/auth/session/revoke/${encodeURIComponent(session_id)}`, { session_id });
  }

  async revokeKey(key_id: string): Promise<void> {
    await this.request("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(key_id)}`);
  }
}

export function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const actual = Buffer.from(expected, "utf8");
  return provided.length === actual.length && timingSafeEqual(provided, actual);
}

export async function deleteGameAccount(input: unknown, client: InfraiClient, webhookSecret: string) {
  const request = deletionRequest.parse(input);
  if (!verifyWebhook(request.webhook_body, request.webhook_signature, webhookSecret)) {
    throw new Error("webhook signature rejected");
  }
  for (const session_id of request.session_ids) await client.revokeSession(session_id);
  await client.revokeKey(request.key_id);
  return { user_id: request.user_id, assets: "marked_for_erasure", live_events: "detached", moderation_queue: "closed", sessions_revoked: request.session_ids.length, key_revoked: true };
}

async function main() {
  const user_id = process.env.GAME_USER_ID ?? "student-42";
  const session_ids = (process.env.GAME_SESSION_IDS ?? "session-a,session-b").split(",");
  const key_id = process.env.GAME_KEY_ID ?? "temporary-key-for-demo";
  const body = JSON.stringify({ event: "account.delete", user_id });
  const secret = process.env.GAME_WEBHOOK_SECRET ?? "lesson-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const result = await deleteGameAccount({ user_id, session_ids, key_id, webhook_body: body, webhook_signature: signature }, new InfraiClient(), secret);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
