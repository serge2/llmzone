// src/lib/services/adapters/interface.ts
import type { Message, WorkspaceSettings, ToolCall } from '$lib/types';

export interface StreamChunkResult {
  content?: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  responseId?: string;
  promptProgress?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  isDone?: boolean;
  // Добавленные поля для автономных адаптеров (LM Studio)
  isNewMessage?: boolean; 
  toolResult?: {
    tool_call_id: string;
    content: string;
    isError: boolean;
  };
}

export interface ChatAdapter {
  isAutonomous?: boolean; // Флаг: сам ли адаптер управляет циклом инструментов
  getEndpoint(baseUrl: string): string;
  getHeaders(settings: WorkspaceSettings): Record<string, string>;
  preparePayload(
    messages: Message[], 
    settings: WorkspaceSettings, 
    serverInstances?: any[], 
    finalSystemPrompt?: string
  ): { payload: any; context: any };
  parseStreamChunk(line: string, context: any): StreamChunkResult;

  /**
   * Специфичный для провайдера метод генерации названия чата.
   * Адаптер сам решает, как упаковать историю и какой эндпоинт вызвать.
   */
  generateChatTitle(
    history: Message[], 
    settings: WorkspaceSettings
  ): Promise<string | 'SKIP'>;
}
