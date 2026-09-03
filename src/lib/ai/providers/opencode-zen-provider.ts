import { AIProvider } from "../provider";
import { AIMessage, AICompletionRequest, AICompletionResponse } from "../types";
import { AI_CONFIG } from "../config";
import { zodToJsonSchema } from "zod-to-json-schema";

export class OpenCodeZenProvider implements AIProvider {
  name = "opencode";

  async generateStructured<T>(
    request: AICompletionRequest<T>
  ): Promise<AICompletionResponse<T>> {
    const apiKey = AI_CONFIG.API_KEY;
    
    if (!apiKey) {
      throw new Error("AI provider not configured (missing API key).");
    }

    const url = `${AI_CONFIG.BASE_URL}/chat/completions`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT_MS);

    try {
      // Create JSON schema from Zod to instruct the model on the expected format
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonSchema = zodToJsonSchema(request.schema as any);
      
      const payload = {
        model: AI_CONFIG.MODEL,
        messages: request.messages,
        temperature: request.temperature ?? 0.1, // Low temperature for deterministic evaluation
        max_tokens: request.maxTokens ?? 2000,
        response_format: { type: "json_object" }, // Many OpenAI-compatible endpoints support this
      };

      // We append a system message enforcing the JSON schema structure
      const schemaInstruction = `You must respond with valid JSON that strictly matches this JSON schema:\n${JSON.stringify(jsonSchema)}\nDo not include any text outside of the JSON object.`;
      
      const messagesWithSchema = [
        ...payload.messages,
        { role: "system", content: schemaInstruction }
      ];
      payload.messages = messagesWithSchema as AIMessage[];

      let responseData: { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } | string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | undefined;
      let lastError: Error | null = null;
      let attempt = 0;
      const MAX_RETRIES = 3;

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
            
            // Check for 502 / overloaded
            if (response.status === 502 || response.status === 503 || text.toLowerCase().includes("overloaded")) {
              throw new Error(`OpenCode API overloaded (${response.status}): ${text}`);
            }

            throw new Error(`OpenCode API error: ${response.status} ${response.statusText} - ${text}`);
          }

          const data = (await response.json()) as NonNullable<typeof responseData>;
          responseData = data;

          if (data.error) {
            const errorMsg = typeof data.error === 'string' ? data.error : data.error.message ?? "Unknown error";
            throw new Error(`OpenCode API returned error object: ${errorMsg}`);
          }

          break; // Success, exit retry loop
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          lastError = err;
          // Retry on 502/503/overloaded
          if (attempt < MAX_RETRIES && (err.message.includes("overloaded") || err.message.includes("502") || err.message.includes("503"))) {
            // Wait with exponential backoff: 1s, 2s, 4s...
            const waitTime = Math.pow(2, attempt - 1) * 1000;
            console.log(`[OpenCodeZenProvider] 502/503 encountered. Retrying in ${waitTime}ms (Attempt ${attempt}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          throw error; // Not a retryable error or out of retries
        }
      }

      if (!responseData) {
        throw lastError || new Error("Failed to get response after retries.");
      }
      // TypeScript narrows responseData after the null check above
      const rd = responseData;

      const content = rd.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Received empty content from AI provider.");
      }

      // Try to parse and validate with Zod
      let parsedJson;
      try {
        parsedJson = JSON.parse(content);
      } catch {
        throw new Error(`AI generated malformed JSON: ${content}`);
      }

      // Normalize common LLM naming variations before Zod validation
      // Models sometimes return snake_case keys instead of camelCase
      if (parsedJson.evidence && Array.isArray(parsedJson.evidence)) {
        parsedJson.evidence = parsedJson.evidence.map((ev: Record<string, unknown>) => ({
          chunkId: ev.chunkId || ev.chunk_id || ev.chunkID || "",
          reason: ev.reason || ev.explanation || ev.document || "",
          ...ev,
        }));
      }

      const validatedData = request.schema.parse(parsedJson);

      return {
        data: validatedData,
        rawResponse: content,
        usage: {
          promptTokens: rd.usage?.prompt_tokens ?? 0,
          completionTokens: rd.usage?.completion_tokens ?? 0,
          totalTokens: rd.usage?.total_tokens ?? 0,
        }
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AI provider request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
