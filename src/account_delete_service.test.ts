import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { deleteGameAccount, type DeletionRequest } from "./account_delete_service.ts";

const calls: string[] = [];
const client = {
  revokeSession: async (id: string) => { calls.push(`session:${id}`); },
  revokeKey: async (id: string) => { calls.push(`key:${id}`); }
} as never;
const body = JSON.stringify({ event: "account.delete", user_id: "learner-7" });
const secret = "test-secret";
const request: DeletionRequest = {
  user_id: "learner-7",
  session_ids: ["s1", "s2"],
  key_id: "k1",
  webhook_body: body,
  webhook_signature: createHmac("sha256", secret).update(body).digest("hex")
};

const result = await deleteGameAccount(request, client, secret);
assert.deepEqual(calls, ["session:s1", "session:s2", "key:k1"]);
assert.equal(result.sessions_revoked, 2);
assert.equal(result.key_revoked, true);
console.log("account deletion decision passed");
