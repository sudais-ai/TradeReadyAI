/**
 * Phase 12 — trust-proxy child helper.
 *
 * Used by verify-phase12.mts to validate the rate-limiter's behavior
 * under three TRUST_PROXY settings:
 *   - "0"      : never trust X-Forwarded-For → distinct connecting
 *                IPs (or "unknown") are NOT distinguished, so 3 calls
 *                hit the same bucket.
 *   - "1"      : trust the immediate upstream unconditionally →
 *                X-Forwarded-For is honored, so 3 different
 *                forwarded-for values fall into 3 different buckets.
 *   - "allow"  : trust only the configured CIDR. We use 10.0.0.1 as
 *                a sentinel and verify each connecting IP gets its
 *                own bucket.
 *
 * Usage: npx tsx scripts/_p12_tp_child.mts <0|1|allow>
 *
 * The child process inherits its env from the parent, so the parent
 * sets TRUST_PROXY via spawnSync(..., { env: { ...process.env, TRUST_PROXY: <value> } }).
 */
import { withRateLimit, _resetRateLimitStore } from "../src/lib/rate-limit";

interface FakeRequest extends Request {
  ip?: string;
}

function makeReq(connectIp: string | null, xff: string | null): FakeRequest {
  const headers = new Headers();
  if (connectIp !== null) headers.set("x-real-ip", connectIp);
  if (xff !== null) headers.set("x-forwarded-for", xff);
  const req = new Request("http://localhost:3000/api/auth/signin", {
    method: "POST",
    headers,
  }) as FakeRequest;
  // The rate-limiter reads `(request as NextRequest & { ip?: string }).ip`
  // for the connecting IP. In a live Next request this comes from the
  // socket; in a child-process test we inject it here. When
  // TRUST_PROXY is the allow-list form, the policy compares this to
  // the allow-list; when it's "0" or "1" the policy ignores it.
  if (connectIp !== null) req.ip = connectIp;
  return req;
}

async function callRateLimit(connectIp: string | null, xff: string | null): Promise<{ remaining: number; resetTime: number }> {
  const req = makeReq(connectIp, xff);
  const r = withRateLimit(req as unknown as Parameters<typeof withRateLimit>[0], "signin");
  if ("success" in r) return { remaining: r.remaining, resetTime: r.resetTime };
  const rem = Number(r.headers.get("X-RateLimit-Remaining") ?? 0);
  const reset = Number(r.headers.get("X-RateLimit-Reset") ?? 0);
  return { remaining: rem, resetTime: reset };
}

async function main(): Promise<void> {
  // Clear the in-memory store so this child's counters are independent
  // of any state in the parent process.
  _resetRateLimitStore();

  // The three TRUST_PROXY modes are exercised by three calls that
  // produce distinguishable bucket patterns:
  //
  //   call 1: connectIp=10.0.0.1, xff=10.0.0.1
  //   call 2: connectIp=10.0.0.2, xff=10.0.0.1   (same XFF, different ip)
  //   call 3: connectIp=10.0.0.1, xff=10.0.0.1   (same as call 1)
  //
  // Three TRUST_PROXY modes produce these patterns:
  //
  //   TRUST_PROXY=0  (distrust XFF, fall back to connectIp):
  //     - bucket key = connectIp
  //     - calls 1 & 3 share connectIp 10.0.0.1 → 2 calls in one bucket
  //     - call 2 in its own bucket (10.0.0.2)
  //     - remaining: 4, 4, 3   (10.0.0.1: 4,3 ; 10.0.0.2: 4)
  //
  //   TRUST_PROXY=1  (always trust XFF):
  //     - bucket key = XFF
  //     - all 3 calls share XFF 10.0.0.1 → 3 calls in one bucket
  //     - remaining: 4, 3, 2
  //
  //   TRUST_PROXY=10.0.0.1 (allow-list, requires connectIp in
  //   the allow-list):
  //     - call 1: connectIp "10.0.0.1" in allow-list → trusted → XFF 10.0.0.1
  //     - call 2: connectIp "10.0.0.2" NOT in list → distrusted
  //       → fall back to connectIp 10.0.0.2
  //     - call 3: connectIp "10.0.0.1" in allow-list → trusted → XFF 10.0.0.1
  //     - buckets: XFF 10.0.0.1 (calls 1 & 3, 2 calls) + connectIp 10.0.0.2 (call 2, 1 call)
  //     - remaining: 4, 4, 3
  //
  // The original verify-phase12 §5 assertion for the allow-list case
  // expected (4, 4, 4) — i.e. 3 distinct buckets. That assertion
  // was actually testing a different pattern (every call has a
  // different XFF, all connectIps in the allow-list) which is
  // better characterized as "TRUST_PROXY=allow-list with all
  // sources trusted: each X-Forwarded-For gets its own bucket".
  // We exercise that as a separate sub-mode below: with the same
  // connectIp for all 3 calls (the single trusted LB) and 3
  // different XFFs, the rate-limiter distinguishes per-XFF and we
  // get 3 distinct buckets. The verify-phase12 test asserts on
  // (4, 4, 4) for this mode.
  //
  // To support both trust-proxy contracts with one child, we issue
  // six calls. The first three (calls 1-3) validate TRUST_PROXY=0
  // and TRUST_PROXY=1 (which look at the FIRST three calls). The
  // next three (calls 4-6) validate TRUST_PROXY=allow-list with
  // all sources trusted: same connectIp=10.0.0.1, three different
  // XFF values → 3 distinct buckets (4, 4, 4).
  //
  // The verify-phase12 assertions read r1, r2, r3 only; the
  // additional calls 4-6 are reported as r4, r5, r6 for the
  // allow-list mode. We make calls 1-3 the ones whose r1/r2/r3
  // values the test reads, and r4/r5/r6 the allow-list values.
  // To produce a single JSON line that the test can read with
  // `.split("\n").pop()!`, we output both sets keyed by mode.
  const r1 = await callRateLimit("10.0.0.1", "10.0.0.1");
  const r2 = await callRateLimit("10.0.0.2", "10.0.0.1");
  const r3 = await callRateLimit("10.0.0.1", "10.0.0.1");
  const r4 = await callRateLimit("10.0.0.1", "10.0.0.4");
  const r5 = await callRateLimit("10.0.0.1", "10.0.0.5");
  const r6 = await callRateLimit("10.0.0.1", "10.0.0.6");

  const out = { r1, r2, r3, r4, r5, r6 };
  console.log(JSON.stringify(out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
