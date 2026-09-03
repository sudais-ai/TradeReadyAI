/**
 * Phase 11 — Cross-encoder Reranker.
 *
 * Re-orders a candidate list of (query, passage) pairs by their relevance
 * score. The model is a real cross-encoder (`Xenova/ms-marco-MiniLM-L-6-v2`,
 * trained on the MS MARCO passage ranking dataset), distinct from the
 * bi-encoder used for the embedding search.
 *
 * Why a cross-encoder:
 *  - Bi-encoders (the embedding model) embed query and passage independently,
 *    then compare via cosine similarity. They are fast but lossy.
 *  - Cross-encoders take (query, passage) as a single input and output a
 *    calibrated relevance score. They are slower but more accurate. The
 *    standard pattern is: bi-encoder for recall, cross-encoder for precision.
 *
 * Architecture (preserved from audit):
 *  - Same library already used by the embedding provider and the OCR
 *    processor (`@xenova/transformers`).
 *  - The pipeline is loaded once and cached at module scope.
 *  - The model is downloaded from the HuggingFace Hub on first use and
 *    cached under `node_modules/@xenova/transformers/.cache/` (same path
 *    as the embedding model). No new dependency.
 *
 * Important: this particular ONNX model is a SINGLE-logit cross-encoder
 * (`id2label: { "0": "LABEL_0" }`, `sbert_ce_default_activation_function:
 * torch.nn.modules.linear.Identity`). The standard `text-classification`
 * pipeline applies softmax which on a 1-class model always yields 1.0,
 * so we bypass the pipeline wrapper and call the tokenizer + model
 * directly, applying a sigmoid to the raw logit. This is the canonical
 * `sentence-transformers.CrossEncoder` pattern.
 *
 * Honest limitations:
 *  - The cross-encoder was trained on English MS MARCO web queries; for
 *    a specific domain (e.g. legal/regulatory text) the absolute scores
 *    may be miscalibrated, but the **ranking** is still a strong signal.
 *  - Inference is CPU-bound and runs in the Node.js process. For a single
 *    RAG call, we score at most `topK` candidates (default 20), so the
 *    cost is bounded.
 *  - If the model fails to load, the reranker is a no-op: it returns
 *    the candidates in their existing order with a flag set so the
 *    caller can log/observe.
 */

import { SearchResult } from "../embeddings/search-service";
import { log } from "../log";

const DEFAULT_MODEL_ID = "Xenova/ms-marco-MiniLM-L-6-v2";
const MAX_PASSAGE_CHARS = 512; // ~256 tokens. Cross-encoder truncates anyway.

export interface RerankOptions {
  /** Override the model id (e.g. for tests). */
  modelId?: string;
  /** How many top results to keep. Default = input length. */
  topK?: number;
  /** Force a no-op (skip the model). Used by tests. */
  disabled?: boolean;
}

export interface RerankResult {
  /** The reranked candidates, best first. */
  results: SearchResult[];
  /** True if the cross-encoder was used. False if a no-op fallback ran. */
  fromModel: boolean;
  /** Per-pair raw score (in the same order as `results`). */
  scores: number[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPipeline = any;

interface RerankerModelInternals {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenizer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  pipeline: AnyPipeline;
}

class RerankerModel {
  private modelPromise: Promise<RerankerModelInternals> | null = null;
  private readonly modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  private async getInternals(): Promise<RerankerModelInternals> {
    if (!this.modelPromise) {
      this.modelPromise = (async () => {
        const t0 = Date.now();
        log.info("rag:reranker", "loading model", { modelId: this.modelId });
        const { pipeline, env } = await import("@xenova/transformers");
        env.cacheDir = env.cacheDir || "./node_modules/@xenova/transformers/.cache";
        env.allowLocalModels = true;
        const p = (await pipeline("text-classification", this.modelId, {
          quantized: true,
        })) as AnyPipeline;
        log.info("rag:reranker", "model ready", {
          modelId: this.modelId,
          loadMs: Date.now() - t0,
        });
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tokenizer: (p as any).tokenizer,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          model: (p as any).model,
          pipeline: p,
        };
      })().catch((err) => {
        this.modelPromise = null;
        throw err;
      });
    }
    return this.modelPromise;
  }

  /**
   * Score (query, passage) pairs. The Xenova ONNX port of
   * `cross-encoder/ms-marco-MiniLM-L-6-v2` is a single-logit model
   * (`id2label: { "0": "LABEL_0" }`, `sbert_ce_default_activation_function:
   * torch.nn.modules.linear.Identity`). The `text-classification` pipeline
   * applies softmax which on a 1-class model always yields 1.0, so we
   * bypass the pipeline wrapper and call the tokenizer + model directly,
   * applying a sigmoid to the raw logit. This is the canonical
   * `sentence-transformers.CrossEncoder` pattern.
   */
  async score(
    query: string,
    passages: string[]
  ): Promise<number[]> {
    const { tokenizer, model } = await this.getInternals();
    // The transformers tokenizer accepts `text: string[]` and
    // `text_pair: string[]` as separate options. We tokenize the query
    // as a batch (replicated for each passage) and the passages as the
    // text_pair.
    const textBatch = passages.map(() => query);
    const modelInputs = await tokenizer(textBatch, {
      text_pair: passages.map((p) => p.slice(0, MAX_PASSAGE_CHARS)),
      padding: true,
      truncation: true,
    });
    const outputs = await model(modelInputs);
    // outputs.logits is a Tensor of shape [batch, 1] for this model.
    // We coerce to a plain array of numbers and apply sigmoid.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Float32Array | number[] = (outputs.logits.data as any) ?? [];
    const raw: number[] = Array.from(data as ArrayLike<number>);
    return raw.map((v) => 1 / (1 + Math.exp(-v)));
  }
}

const modelCache = new Map<string, RerankerModel>();

function getModel(modelId: string): RerankerModel {
  let m = modelCache.get(modelId);
  if (!m) {
    m = new RerankerModel(modelId);
    modelCache.set(modelId, m);
  }
  return m;
}

/**
 * Rerank a list of candidates against a query. Returns the candidates
 * in their new (best-first) order, plus a parallel `scores[]` array.
 *
 * Trade-case isolation: this layer does NOT see tradeCaseId directly.
 * That is enforced upstream by the retrievers that produced the candidates.
 * The reranker only ever sees candidates that have already been filtered
 * by `tradeCaseId`; this is the same pattern as the OCR module.
 */
export async function rerank(
  query: string,
  candidates: SearchResult[],
  options: RerankOptions = {}
): Promise<RerankResult> {
  if (candidates.length === 0) {
    return { results: [], fromModel: false, scores: [] };
  }

  const modelId = options.modelId || DEFAULT_MODEL_ID;
  const topK = options.topK ?? candidates.length;

  if (options.disabled) {
    return {
      results: candidates.slice(0, topK),
      fromModel: false,
      scores: candidates.map(() => 0),
    };
  }

  let scores: number[];
  try {
    const m = getModel(modelId);
    scores = await m.score(query, candidates.map((c) => c.content));
  } catch (err) {
    // Honest fallback: if the model cannot be loaded, do not silently
    // pretend the ranking happened. Return the original order with
    // `fromModel: false` so the caller can log/observe.
    log.warn("rag:reranker", "model load/inference failed, returning input order", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      results: candidates.slice(0, topK),
      fromModel: false,
      scores: candidates.map(() => 0),
    };
  }

  // Build (score, candidate) pairs and sort descending by score.
  const pairs: Array<{ score: number; result: SearchResult }> = candidates.map(
    (r, i) => ({ score: scores[i] ?? 0, result: r })
  );
  pairs.sort((a, b) => b.score - a.score);

  return {
    results: pairs.slice(0, topK).map((p) => ({
      ...p.result,
      // Stash the cross-encoder score into `similarity` so downstream
      // stages see one consistent field. (The original vector similarity
      // is dropped — the cross-encoder is the better signal.)
      similarity: p.score,
    })),
    fromModel: true,
    scores: pairs.slice(0, topK).map((p) => p.score),
  };
}
