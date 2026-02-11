// src/lib/services/adapters/openRouterAdapter.ts
import type { ChatAdapter, StreamChunkResult } from './interface';
import type { Message, WorkspaceSettings } from '$lib/types';

export class OpenRouterAdapter implements ChatAdapter {
  isAutonomous = false;

  /**
   * Эндпоинт OpenRouter: используем URL из настроек, если он есть,
   * иначе используем стандартный облачный адрес.
   */
  getEndpoint(baseUrl: string): string {
    // Если baseUrl передан (из settings.apiUrl) и он не пустой, используем его.
    // Очищаем от лишних слешей и приводим к полному пути, если нужно.
    if (baseUrl && baseUrl.trim() !== '') {
      const base = baseUrl.replace(/\/+$/, '');
      return base.endsWith('/chat/completions') ? base : `${base}/v1/chat/completions`;
    }

    // Дефолтный адрес OpenRouter
    return 'https://openrouter.ai/api/v1/chat/completions';
  }

  /**
   * Специфические заголовки OpenRouter
   */
  getHeaders(settings: WorkspaceSettings): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
      'X-Title': 'Gemini Chat Client',
    };
    return headers;
  }

  /**
   * Подготовка тела запроса.
   * Синхронизировано с логикой MCP и OpenAI стандарта.
   */
  preparePayload(messages: Message[], settings: WorkspaceSettings, serverInstances: any[], finalSystemPrompt: string) {
    const toolLookupMap = new Map();
    const tools: any[] = [];

    if (serverInstances) {
      for (const instance of serverInstances) {
        if (!instance.enabled || !instance.isConnected) continue;
        for (const tool of instance.tools) {
          const uniqueName = `${instance.name}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          toolLookupMap.set(uniqueName, { server: instance, originalName: tool.name });
          tools.push({
            type: 'function',
            function: {
              name: uniqueName,
              description: tool.description,
              parameters: tool.inputSchema
            }
          });
        }
      }
    }

    const payload: any = {
      model: settings.modelName,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...messages.map(m => {
          if (m.role === 'tool') {
            return { 
              role: 'tool', 
              tool_call_id: m.tool_result?.tool_call_id || (m as any).id, 
              content: typeof m.tool_result?.content === 'object' 
                ? JSON.stringify(m.tool_result.content) 
                : String(m.tool_result?.content || "") 
            };
          }
          const msg: any = { role: m.role, content: m.text || "" };
          if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
            msg.tool_calls = m.tool_calls.map((tc: any) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {})
              }
            }));
          }
          return msg;
        })
      ],
      stream: true,
      temperature: settings.temperature,
      // Специфика OpenRouter для моделей с рассуждениями
      include_reasoning: true 
    };

    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    return { payload, context: { toolLookupMap, currentToolCalls: [] } };
  }

  /**
   * Парсинг чанка. 
   * Теперь принимает строку (line) и контекст, как и остальные адаптеры.
   */
  parseStreamChunk(line: string, context: any): StreamChunkResult {
    const raw = line.replace(/^data: /, '').trim();
    if (!raw || raw === '[DONE]') return { isDone: true };

    try {
      const data = JSON.parse(raw);
      
      if (data.error) {
        console.error("[OpenRouter] Error chunk:", data.error);
        return { isDone: true };
      }

      const choice = data.choices?.[0];
      
      // OpenRouter часто присылает usage в финальном пустом чанке
      if (!choice && data.usage) {
        return { usage: data.usage, isDone: true };
      }
      
      if (!choice) return {};

      const delta = choice.delta;
      const result: StreamChunkResult = {};

      if (delta?.content) result.content = delta.content;
      
      // Сбор рассуждений (reasoning/thought)
      if (delta?.reasoning || delta?.reasoning_content || delta?.thought) {
        result.reasoning = delta.reasoning || delta.reasoning_content || delta.thought;
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.index === undefined) continue;
          
          if (!context.currentToolCalls[tc.index]) {
            context.currentToolCalls[tc.index] = { id: tc.id || '', name: '', arguments: '' };
          }

          const currentCall = context.currentToolCalls[tc.index];
          if (tc.id) currentCall.id = tc.id;
          if (tc.function?.name) {
            if (!currentCall.name) currentCall.name = tc.function.name;
            else if (!currentCall.name.includes(tc.function.name)) currentCall.name += tc.function.name;
          }
          if (tc.function?.arguments) currentCall.arguments += tc.function.arguments;
        }

        // Парсинг аргументов для MCP (как в OpenAI адаптере)
        result.toolCalls = context.currentToolCalls.map((call: any) => {
          const finalCall = { ...call };
          const rawArgs = finalCall.arguments.trim();
          if (rawArgs.startsWith('{') && rawArgs.endsWith('}')) {
            try {
              finalCall.arguments = JSON.parse(rawArgs);
            } catch (e) {}
          }
          return finalCall;
        });
      }

      if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
        result.isDone = true;
      }

      return result;
    } catch (e) {
      return {};
    }
  }
}
