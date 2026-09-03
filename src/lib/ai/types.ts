import { z } from "zod";

export interface AIProviderConfig {
  name: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest<T> {
  messages: AIMessage[];
  schema: z.ZodSchema<T>;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionResponse<T> {
  data: T;
  rawResponse?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
