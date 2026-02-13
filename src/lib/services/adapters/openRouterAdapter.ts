// src/lib/services/adapters/openRouterAdapter.ts
import { fetch } from '@tauri-apps/plugin-http';
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
        // ChatService уже отфильтровал выключенные сервера и инструменты.
        // Просто собираем то, что разрешено.
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
            if ('approvalStatus' in (msg as any)) delete (msg as any).approvalStatus;
          }
          return msg;
        })
      ],
      stream: true
    };

    // Опциональные параметры — добавляем только если они заданы пользователем
    if (settings.modelName !== undefined) payload.model = settings.modelName;
    if (settings.temperature !== undefined) payload.temperature = settings.temperature;
    if (settings.topP !== undefined) payload.top_p = settings.topP;
    if (settings.seed !== undefined) payload.seed = settings.seed;
    if (settings.maxCompletionTokens !== undefined) payload.max_completion_tokens = settings.maxCompletionTokens;
    if (settings.frequencyPenalty !== undefined) payload.frequency_penalty = settings.frequencyPenalty;
    if (settings.presencePenalty !== undefined) payload.presence_penalty = settings.presencePenalty;
    if (settings.verbosity !== undefined) payload.verbosity = settings.verbosity;

    // Параметры рассуждений для моделей OpenAI (o1, o3-mini)
    if (settings.reasoningEffort && settings.reasoningEffort !== 'none') {
      payload.reasoning_effort = settings.reasoningEffort;
      
      // Для моделей серии o1/o3 убираем несовместимые параметры
      const isOModel = settings.modelName.includes('openai/o1') || settings.modelName.includes('openai/o3');
      if (isOModel) {
        delete payload.temperature;
        delete payload.top_p;
      }
    }

    if (tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    console.log("Prepared OpenRouter payload:", payload);

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

  /**
   * Генерация названия чата через OpenRouter.
   * Инструкция передается в конце истории для повышения стабильности.
   */
  async generateChatTitle(history: Message[], settings: WorkspaceSettings): Promise<string | 'SKIP'> {
    const analysis_history = history
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.text)
      .map(msg => ({ role: msg.role, content: msg.text }));

    if (analysis_history.length < 1) return 'SKIP';

    // Инструкция вынесена в отдельное User-сообщение в конце
    const prompt_trigger = `
[TASK: PROVIDE A CHAT TITLE]
1. Analyze the conversation above.
2. Provide a concise title (2-4 words) in the user's language.
3. If there is no specific topic yet (only greetings or empty talk), respond ONLY with the word "SKIP".
4. Do not use quotes, bold text, or punctuation.
5. Respond ONLY with the title or SKIP.`;

    try {
      const response = await fetch(this.getEndpoint(settings.apiUrl), {
        method: 'POST',
        headers: this.getHeaders(settings),
        body: JSON.stringify({
          model: settings.modelName,
          messages: [
            { role: 'system', content: "You are a helpful assistant that categorizes and titles conversations." },
            ...analysis_history,
            { role: 'user', content: prompt_trigger }
          ],
          temperature: 0.1,
          stream: false
        })
      });

      if (!response.ok) return 'SKIP';
      const data = await response.json();
      console.log("[OpenRouterAdapter] Name proposition response:", data);
      
      // Очистка контента от возможного мусора (переносы строк, лишние символы)
      const rawResult = data.choices?.[0]?.message?.content || "";
      const result = rawResult.split('\n')[0].trim();

      if (!result || result.toUpperCase().includes('SKIP')) return 'SKIP';
      
      // Удаляем кавычки, если модель их все же добавила
      return result.replace(/["']/g, '');
    } catch (e) {
      console.error("[OpenRouterAdapter] Failed to generate title:", e);
      return 'SKIP';
    }
  }
}
