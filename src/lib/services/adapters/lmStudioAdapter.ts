// src/lib/services/adapters/lmStudioAdapter.ts
import { fetch } from '@tauri-apps/plugin-http';
import type { Message, WorkspaceSettings, ToolCall } from '$lib/types';
import type { ChatAdapter, StreamChunkResult } from './interface';

/**
 * LM Studio API Streaming Events Documentation:
 * * The stream always begins with 'chat.start' and concludes with 'chat.end'.
 * * List of event types:
 * - chat.start: Emitted at the start. Contains model_instance_id.
 * - model_load.start/progress/end: Signals model loading status.
 * - prompt_processing.start/progress/end: Signals prompt ingestion status.
 * - reasoning.start/delta/end: Thought process chunks (e.g. for DeepSeek).
 * - tool_call.start: Model starts a tool call. Contains 'tool' name and 'provider_info'.
 * - tool_call.arguments: Streamed JSON arguments for the current tool.
 * - tool_call.success: Result of the tool call ('output') and final arguments.
 * - tool_call.failure: Indicates tool call failed (reason, metadata).
 * - message.start/delta/end: Standard message content chunks.
 * - error: Error during streaming (invalid_request, mcp_connection_error, etc.).
 * - chat.end: Final event with full aggregated 'result' (stats, response_id).
 */

export class LmStudioAdapter implements ChatAdapter {
  /**
   * Флаг, указывающий дирижеру, что этот адаптер работает в автономном режиме.
   * В этом режиме LM Studio сама управляет циклом вызова MCP инструментов.
   */
  public isAutonomous = true;

  /**
   * Формирует эндпоинт для LM Studio API (/api/v1/chat)
   */
  getEndpoint(baseUrl: string): string {
    const base = baseUrl.replace(/\/+$/, '');
    return base.endsWith('/chat') ? base : `${base}/api/v1/chat`;
  }

  /**
   * Заголовки для самого запроса к LM Studio
   */
  getHeaders(settings: WorkspaceSettings): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }
    return headers;
  }

  /**
   * Подготовка Payload для LM Studio API
   */
  preparePayload(
    messages: Message[], 
    settings: WorkspaceSettings, 
    serverInstances?: any[], 
    finalSystemPrompt?: string
  ): { payload: any; context: any } {
    console.log("preparePayload massages:", messages);
    console.log("preparePayload serverInstances:", serverInstances);
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastAssistantWithId = [...messages].reverse().find(m => (m as any).response_id);
    console.log("preparePayload previous_respose_id:", lastAssistantWithId? lastAssistantWithId.response_id || null : undefined);
 
    const payload: any = {
      model: settings.modelName,
      input: lastUserMsg?.text || "",
      stream: true,
      system_prompt: finalSystemPrompt || settings.systemPrompt,
      store: true 
    };

    // Опциональные параметры сэмплирования для LM Studio
    if (settings.temperature !== undefined) payload.temperature = settings.temperature;
    if (settings.topP !== undefined) payload.top_p = settings.topP;
    if (settings.minP !== undefined) payload.min_p = settings.minP;
    if (settings.topK !== undefined) payload.top_k = settings.topK;
    if (settings.seed !== undefined) payload.seed = settings.seed;
    if (settings.maxCompletionTokens !== undefined) payload.max_output_tokens = settings.maxCompletionTokens;
    if (settings.repeatPenalty !== undefined) payload.repeat_penalty = settings.repeatPenalty;
    if (settings.reasoning && settings.reasoning !== 'off') payload.reasoning = settings.reasoning;

    if (serverInstances && serverInstances.length > 0) {
      const integrations = serverInstances
        .map(server => {
          return {
            type: 'ephemeral_mcp',
            server_label: server.name,
            server_url: server.url,
            // Явно передаем список разрешенных инструментов
            allowed_tools: (server.tools || []).map((t: any) => t.name),
            // Берем заголовки либо из проксированного объекта, либо напрямую из конфига
            headers: server.headers || server.config?.headers || {}
          };
        });

      if (integrations.length > 0) {
        payload.integrations = integrations;
      }
    }

    if (lastAssistantWithId && lastAssistantWithId.response_id) {
      payload.previous_response_id = lastAssistantWithId.response_id;
    }

    console.log("Prepared LM Studio payload:", payload);
    return { 
      payload, 
      context: { 
        currentToolCall: null as any,
        activeCallId: null as any
      } 
    };
  }

  /**
   * Парсинг SSE стрима LM Studio
   */
  parseStreamChunk(line: string, context: any): StreamChunkResult {
    const trimmed = line.trim();
    
    // Игнорируем строки типов событий SSE (event: message.delta и т.д.)
    if (trimmed.startsWith('event:')) {
      return {};
    }

    const raw = trimmed.replace(/^data: /, '').trim();
    if (!raw || raw === '[DONE]') return { isDone: true };

    try {
      const event = JSON.parse(raw);
      
      switch (event.type) {
        case 'chat.start':
        case 'model_load.start':
        case 'model_load.progress':
        case 'model_load.end':
        case 'prompt_processing.start':
          break;
        case 'prompt_processing.progress':
          return { 
            // LM Studio выдает 0.0-1.0, сохраняем как есть
            promptProgress: event.progress 
          };
        case 'prompt_processing.end':
          break;

        case 'reasoning.delta':
          return { reasoning: event.content };

        case 'tool_call.start':
          if (!context.activeCallId) {
            context.activeCallId = `call_${Math.random().toString(36).substring(2, 9)}`;
          }
          context.currentToolCall = {
            id: context.activeCallId,
            name: '', 
            arguments: {}
          };
          return { toolCalls: [context.currentToolCall] };

        case 'tool_call.name':
          if (context.currentToolCall) {
            context.currentToolCall.name = event.tool_name;
            return { toolCalls: [{ ...context.currentToolCall }] };
          }
          break;

        case 'tool_call.arguments':
          if (context.currentToolCall) {
            if (event.tool) context.currentToolCall.name = event.tool;
            context.currentToolCall.arguments = event.arguments;
            return { toolCalls: [{ ...context.currentToolCall }] };
          }
          break;

        case 'tool_call.success':
          if (context.currentToolCall) {
            if (event.tool) context.currentToolCall.name = event.tool;
            context.currentToolCall.arguments = event.arguments;
            const finalCall = { ...context.currentToolCall };
            
            // --- ЧЕСТНЫЙ ВЫВОД БЕЗ МОДИФИКАЦИЙ ---
            let rawOutput = event.output;
            try {
              // Десериализуем строку из лога в реальный объект, 
              // чтобы потом сохранить его как форматированный JSON
              const parsed = JSON.parse(event.output);
              rawOutput = JSON.stringify(parsed, null, 2);
            } catch (e) {
              // Если это не JSON, оставляем как пришло
              rawOutput = event.output;
            }

            const result = { 
              toolCalls: [finalCall],
              toolResult: {
                tool_call_id: finalCall.id,
                content: rawOutput,
                isError: false
              }
            };

            context.currentToolCall = null;
            context.activeCallId = null;

            return result;
          }
          break;

        case 'tool_call.failure':
          if (context.currentToolCall) {
            const finalCall = { ...context.currentToolCall };
            context.currentToolCall = null;
            context.activeCallId = null;
            return { 
              toolCalls: [finalCall],
              toolResult: {
                tool_call_id: finalCall.id,
                content: event.reason || 'Tool execution failed',
                isError: true
              }
            };
          }
          break;

        case 'message.start':
          return { isNewMessage: true };

        case 'message.delta':
          return { content: event.content };

        case 'error':
          throw new Error(event.error?.message || 'LM Studio Stream Error');

        case 'chat.end':
          const endResult: StreamChunkResult = { isDone: true };
          if (event.result?.response_id) {
            endResult.responseId = event.result.response_id;
            console.log("chat.end response_id:", event.result.response_id);
          }
          if (event.result?.stats) {
            endResult.usage = {
              prompt_tokens: event.result.stats.input_tokens || 0,
              completion_tokens: event.result.stats.total_output_tokens || 0,
              total_tokens: (event.result.stats.input_tokens || 0) + (event.result.stats.total_output_tokens || 0)
            };
          }
          return endResult;

        default:
          break;
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('LM Studio')) throw e;
    }

    return {};
  }

  /**
   * Генерация названия чата для LM Studio.
   */
  async generateChatTitle(history: Message[], settings: WorkspaceSettings): Promise<string | 'SKIP'> {
    const analysis_history = history
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.text);

    if (analysis_history.length < 1) return 'SKIP';

    const promptContext = analysis_history
      .map(m => `${m.role.toUpperCase()}: ${m.text}`)
      .join('\n\n');

    // Инструкция по аналогии с OpenAI версией
    const prompt_trigger = `
[TASK: PROVIDE A CHAT TITLE]
1. Analyze the conversation above.
2. Provide a concise title (2-4 words) in the user's language.
3. If there is no specific topic yet (only greetings or empty talk), respond ONLY with the word "SKIP".
4. Do not use quotes, bold text, or punctuation.
5. Respond ONLY with the title or SKIP.`;

    const payload: any = {
      model: settings.modelName,
      input: `CONVERSATION LOG:\n${promptContext}\n\n${prompt_trigger}`,
      system_prompt: "You are a helpful assistant that categorizes and titles conversations.",
      temperature: 0.1,
      stream: false,
      store: false 
    };

    try {
      const response = await fetch(this.getEndpoint(settings.apiUrl), {
        method: 'POST',
        headers: this.getHeaders(settings),
        body: JSON.stringify(payload)
      });

      if (!response.ok) return 'SKIP';
      const data = await response.json();
      const message = data.output.find((item: any) => item.type === 'message');
      const rawResult = message?.content || "SKIP";
      const result = rawResult.split('\n')[0].trim().replace(/["']/g, '').replace(/[.!?]$/, '');

      if (result.toUpperCase().includes('SKIP')) return 'SKIP';
      
      console.log("[LmStudioAdapter] Generated title:", result);
      return result;
    } catch (e) {
      console.error("[LmStudioAdapter] Failed to generate title:", e);
      return 'SKIP';
    }
  }
}
