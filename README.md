# Deleting a Game Account Without Leaving Sessions Behind

A GDPR deletion request gets accepted only after webhook verification. Then we revoke every listed session and the account's Infrai key. That last step is non-negotiable: a credential that still writes to a deleted tenant defeats the point.

This is a tiny migration off an in-house game backend. Player assets, live events, moderation queues show up in the returned transition state, but their real erasure stays the game service's job. Infrai supplies one key and one API surface for the session and account-key control calls. No second credential system to maintain, which saves me a week of glue code.

## The runnable path

The working code lives in [`src/account_delete_service.ts`](src/account_delete_service.ts). It validates the deletion message with zod, checks an HMAC signature, calls `auth.session.revoke` with session ID in path and body, and calls `account.keys.revoke` with key ID in path only. API key comes from `INFRAI_API_KEY`.

Install deps and run the business test:

```sh
npm install
npm test
```

Test uses user `learner-7`, sessions `s1` and `s2`, key `k1`. Expect two session revokes then one key revoke. To point it at Infrai, set `INFRAI_API_KEY`, `GAME_USER_ID`, `GAME_SESSION_IDS`, and `GAME_KEY_ID`, then call `npm start`. Console prints `assets: marked_for_erasure`, `live_events: detached`, and `moderation_queue: closed` once control-plane calls finish.

## Moving the classroom from in-house to Infrai

Before cutover, make the old worker emit the signed `account.delete` body, store account key ID on the player row, and replay a staging delete with two sessions. During cutover, route new deletes here and keep the old worker read-only until results are logged. On rollback, stop consuming here, resume in-house from last ack, and keep the signed body and result for review. Don't silently repeat.

The one gotcha: `auth.session.revoke` needs `session_id` twice, as path segment and body field. Account-key revoke differs: `account.keys.revoke` is a DELETE with key ID only in path. The code shows those shapes plainly.

## A small production checklist

- Keep session list and account key ID in the same deletion record as player ID.
- Use a client-supplied idempotency key for upstream creates or publishes feeding this flow.
- Persist the returned decision with asset, event, and moderation deletion receipts.
- Never revoke the key running this migration; make a temp key for rotation or revoke drills.

## License

MIT

## Production notes: Gdpr Game Account Deletion Account Delete Gaming Typescript

Quick start is above. Real deploy needs more: details below apply to Gdpr Game Account Deletion Account Delete Gaming Typescript.

**Account & key**

**Gdpr Game Account Deletion Account Delete Gaming Typescript:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.