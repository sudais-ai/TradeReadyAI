import { EmbeddingProvider } from "../provider";
import { EMBEDDING_CONFIG } from "../config";

export class OpenCodeZenEmbeddingProvider implements EmbeddingProvider {
  name = "opencode";

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    if (embeddings.length === 0) {
      throw new Error("API returned no embeddings.");
    }
    return embeddings[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = EMBEDDING_CONFIG.API_KEY;
    if (!apiKey) {
      throw new Error("Embedding API key is not configured.");
    }

    const url = `${EMBEDDING_CONFIG.BASE_URL}/embeddings`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_CONFIG.TIMEOUT_MS);

    interface EmbeddingResponse {
        data?: Array<{ embedding: number[]; index: number }>;
        error?: { message?: string } | string;
      }

      try {
        const payload = {
          model: EMBEDDING_CONFIG.MODEL,
          input: texts,
        };

        let responseData: EmbeddingResponse | undefined;
        let lastError: Error | null = null;
        let attempt = 0;
        const MAX_RETRIES = EMBEDDING_CONFIG.MAX_RETRIES;

        while (attempt < MAX_RETRIES) {
          attempt++;
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });

            if (!response.ok) {
              const text = await response.text();
              if (response.status === 429 || response.status === 502 || response.status === 503 || text.toLowerCase().includes("overloaded")) {
                throw new Error(`Embedding API overloaded/rate-limited (${response.status}): ${text}`);
              }
              throw new Error(`Embedding API error: ${response.status} ${response.statusText} - ${text}`);
            }

            responseData = await response.json() as EmbeddingResponse;

            if (responseData.error) {
              const errorMsg = typeof responseData.error === 'string' ? responseData.error : responseData.error.message ?? "Unknown error";
              throw new Error(`Embedding API returned error object: ${errorMsg}`);
            }

            break; // Success, exit retry loop
          } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            lastError = err;
            if (attempt < MAX_RETRIES && (err.message.includes("overloaded") || err.message.includes("rate-limited") || err.message.includes("502") || err.message.includes("503") || err.message.includes("429"))) {
              const waitTime = Math.pow(2, attempt - 1) * 1000;
              console.log(`[OpenCodeZenEmbeddingProvider] API issue encountered. Retrying in ${waitTime}ms (Attempt ${attempt}/${MAX_RETRIES})...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
            throw error;
          }
        }

        if (!responseData || !responseData.data || !Array.isArray(responseData.data)) {
          throw lastError || new Error("Failed to get valid embedding response after retries.");
        }

        // OpenCode Zen / OpenAI compatible APIs return an array of data objects
        // Format: { data: [{ embedding: [0.1, 0.2, ...], index: 0 }, ... ] }
        // Make sure to sort by index if the API doesn't guarantee order, though most do.
        const sortedData = responseData.data.sort((a, b) => a.index - b.index);
        const embeddings = sortedData.map((item) => item.embedding);

      if (embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${embeddings.length}`);
      }

      return embeddings;

    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Embedding API request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
