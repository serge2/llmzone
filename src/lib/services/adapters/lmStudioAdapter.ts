// src/lib/services/adapters/lmStudioAdapter.ts
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
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const lastAssistantWithId = [...messages].reverse().find(m => (m as any).response_id);

    const payload: any = {
      model: settings.modelName,
      input: lastUserMsg?.text || "",
      stream: true,
      temperature: settings.temperature,
      system_prompt: finalSystemPrompt || settings.systemPrompt,
      store: true 
    };

    if (serverInstances && serverInstances.length > 0) {
      const integrations = serverInstances
        .filter(s => s.enabled && s.isConnected)
        .map(server => ({
          type: 'ephemeral_mcp',
          server_label: server.name,
          server_url: server.url,
          headers: server.config?.headers || {}
        }));

      if (integrations.length > 0) {
        payload.integrations = integrations;
      }
    }

    if (lastAssistantWithId && (lastAssistantWithId as any).response_id) {
      payload.previous_response_id = (lastAssistantWithId as any).response_id;
    }

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
    const raw = line.replace(/^data: /, '').trim();
    if (!raw || raw === '[DONE]') return { isDone: true };

    try {
      const event = JSON.parse(raw);
      
      switch (event.type) {
        case 'chat.start':
        case 'model_load.start':
        case 'model_load.progress':
        case 'model_load.end':
        case 'prompt_processing.start':
        case 'prompt_processing.progress':
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
            (endResult as any).response_id = event.result.response_id;
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
}
