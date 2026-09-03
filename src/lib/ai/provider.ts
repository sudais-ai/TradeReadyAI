import { AICompletionRequest, AICompletionResponse } from "./types";

/**
 * Base AI Provider interface.
 * All model providers (e.g., OpenCode, OpenAI, local) must implement this.
 */
export interface AIProvider {
  /**
   * The name of this provider instance (e.g., 'opencode')
   */
  name: string;

  /**
   * Generates a structured JSON response conforming to the provided Zod schema.
   */
  generateStructured<T>(
    request: AICompletionRequest<T>
  ): Promise<AICompletionResponse<T>>;
}
