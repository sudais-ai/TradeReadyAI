/**
 * Phase 11 — Query Rewriter.
 *
 * Purpose: turn a verbose requirement title (often a full sentence like
 * "Confirm that the goods are not subject to anti-dumping duty under
 * regulation X") into a tight retrieval query that names the
 * identifiers and key terms.
 *
 * Architecture (preserved from audit):
 *  - The existing OpenCode Zen AI provider is reused. No new dependency.
 *  - The original `query` is ALWAYS returned alongside the rewrite, so the
 *    hybrid retrieval can search for both.
 *  - A deterministic fallback is implemented for the case where the AI
 *    provider is offline, misconfigured, or returns a malformed rewrite.
 *  - The rewriter is bounded — it is a single, fast call. No streaming,
 *    no tool calls, no agent loop. Just `generateStructured` with a Zod
 *    schema.
 *
 * Safety:
 *  - The prompt explicitly forbids inventing identifiers or numbers.
 *  - Output is bounded to a Zod-validated shape.
 *  - The rewriter is NOT a source of new facts. It only extracts or
 *    shortens terms that already appear in the input.
 */

import { z } from "zod";
import { getAIProvider } from "../ai";
import { log } from "../log";

const queryRewriteSchema = z.object({
  rewritten: z
    .string()
    .max(500)
    .describe(
      "A short, retrieval-friendly reformulation of the original query. May be identical to the original if it is already optimal."
    ),
  terms: z
    .array(z.string().max(80))
    .max(20)
    .describe(
      "Key terms, identifiers, codes, or phrases that should be searched for verbatim (e.g. HS codes, regulation numbers, product names)."
    ),
});

export type QueryRewrite = z.infer<typeof queryRewriteSchema>;

export interface QueryRewriteResult {
  original: string;
  rewrite: QueryRewrite;
  /** True if the rewrite came from the LLM; false if from the deterministic fallback. */
  fromLlm: boolean;
}

const SYSTEM_PROMPT = `You are a search-query rewriter for a trade-compliance RAG system.

Your job is to take a single requirement title and produce TWO things:
1. A short, retrieval-friendly reformulation ("rewritten") of the original.
2. A list of key terms ("terms") that should be searched for verbatim, such as:
   - HS / HTS codes (e.g. "0901.21", "8473.30")
   - Regulation or directive numbers (e.g. "Reg. 1907/2006", "Annex II")
   - Standardized document names (e.g. "Form E", "EUR.1", "Certificate of Origin")
   - Specific product or material names mentioned in the original

CRITICAL RULES:
- Do NOT invent identifiers, numbers, or entities that are not in the original.
- If the original is already an ideal retrieval query, return it unchanged.
- Do NOT add or change the meaning of the requirement.
- Do NOT include any explanation or commentary — only the structured output.`;

const USER_PROMPT = `Rewrite the following requirement for keyword + semantic retrieval:

REQUIREMENT:
"""

{query}

"""

Return JSON with two fields:
- "rewritten": a short, retrieval-friendly reformulation
- "terms": an array of key terms to search verbatim`;

/**
 * Heuristic deterministic rewrite: lower-case, strip common filler phrases,
 * and pull out anything that looks like an HS code, regulation number, or
 * quoted term.
 *
 * This is intentionally simple. It is the fallback path when the LLM is
 * unavailable; it must never silently invent new identifiers.
 */
function deterministicRewrite(query: string): QueryRewrite {
  const original = query.trim();
  const terms = new Set<string>();

  // 1) HS / HTS codes (digits.dots pattern of 4-10 digits).
  const hsMatches = original.match(/\b\d{4}\.\d{2}(?:\.\d{2,4})?\b/g) || [];
  hsMatches.forEach((m) => terms.add(m));

  // 2) Regulation / directive numbers (Reg. 1907/2006, Directive 2001/95/EC).
  //    Allow an optional period after the keyword (Reg.) and an optional
  //    intermediate letter (Article 5a, Regulation 8b/123).
  const regMatches =
    original.match(
      /\b(?:Reg(?:ulation)?|Directive|Annex|Article)\.?\s+[A-Z]?(?:\d+[a-z]?[\/\.]\d+(?:[\/\.][A-Za-z0-9]+)?|\d+[a-z]?)\b/gi
    ) || [];
  regMatches.forEach((m) => terms.add(m));

  // 3) Quoted phrases.
  const quoted = original.match(/"([^"]{2,80})"/g) || [];
  quoted.forEach((m) => terms.add(m.replace(/"/g, "")));

  // 4) Common short forms. Pull capitalised 2+-letter runs (Form E, EUR.1).
  const shortForms =
    original.match(/\b(?:Form\s+[A-Z]|EUR\.\d|EUR-\d|FTA|CETA|USMCA|CPTPP)\b/g) || [];
  shortForms.forEach((m) => terms.add(m));

  // 5) Build a shortened version: drop the first-person / modal helpers and
  //    collapse whitespace. This is "best-effort" — the original is also
  //    kept for hybrid search.
  const fillerRe = /\b(please|kindly|ensure that|confirm that|the|that|is|are|be|of|to|for|with|on|in|at|by|from)\b/gi;
  const shortened = original
    .replace(fillerRe, " ")
    .replace(/[^\w\s.\-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    rewritten: shortened.length > 0 ? shortened : original,
    terms: Array.from(terms).slice(0, 20),
  };
}

/**
 * Run the LLM-based rewriter. Returns `null` on any failure so the caller
 * can fall back to the deterministic version.
 */
async function tryLlmRewrite(
  query: string,
  timeoutMs: number
): Promise<QueryRewrite | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const provider = getAIProvider();
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: USER_PROMPT.replace("{query}", query) },
    ];

    // We do NOT use the `generateStructured` timeout knob directly — instead
    // we race the call against a small timeout so a hung provider does not
    // stall the RAG pipeline. `generateStructured` returns
    // `{ data, rawResponse, usage }`; we want `.data`.
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("rewriter timeout")), timeoutMs);
    });
    const response = await Promise.race([
      provider.generateStructured({ messages, schema: queryRewriteSchema }),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);

    return response.data;
  } catch (err) {
    if (timer) clearTimeout(timer);
    log.warn("rag:query-rewriter", "LLM rewrite failed, falling back to deterministic", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Rewrite a query for retrieval. Always returns a `QueryRewriteResult`
 * with the original query preserved.
 *
 * @param query The original requirement title / question.
 * @param opts.timeoutMs LLM call timeout (default 8s). On timeout, fallback to deterministic.
 * @param opts.useLlm If false, skip the LLM entirely and return the deterministic result.
 */
export async function rewriteQuery(
  query: string,
  opts: { timeoutMs?: number; useLlm?: boolean } = {}
): Promise<QueryRewriteResult> {
  const { timeoutMs = 8000, useLlm = true } = opts;

  const safe = (query || "").trim();
  if (safe.length === 0) {
    return {
      original: "",
      rewrite: { rewritten: "", terms: [] },
      fromLlm: false,
    };
  }

  if (useLlm) {
    const llm = await tryLlmRewrite(safe, timeoutMs);
    if (llm && typeof llm.rewritten === "string" && Array.isArray(llm.terms)) {
      // Defensive: never let the LLM invent a longer string than the original
      // by more than 2x. If it does, fall back.
      if (llm.rewritten.length > safe.length * 2 + 100) {
        log.warn("rag:query-rewriter", "LLM rewrite suspiciously long, falling back");
      } else {
        return { original: safe, rewrite: llm, fromLlm: true };
      }
    }
  }

  return {
    original: safe,
    rewrite: deterministicRewrite(safe),
    fromLlm: false,
  };
}
