// src/lib/services/chatService.ts
import { fetch } from '@tauri-apps/plugin-http'; // ВАЖНО: Используем нативный fetch Tauri для обхода CORS
import { MCPDispatcher } from '$lib/mcp/dispatcher';
import { toastService } from '$lib/services/toastService.svelte';
import type { Message, Chat, WorkspaceSettings } from '$lib/types';
import type { MCPServerInstance } from '$lib/mcp/manager.svelte';

export class ChatService {
  private dispatcher = new MCPDispatcher();
  private MAX_ITERATIONS = 10; // Защита от бесконечных циклов

  /**
   * Основной метод отправки сообщения с поддержкой цикла инструментов
   */
  async send(
    chat: Chat, 
    settings: WorkspaceSettings,
    serverInstances: MCPServerInstance[], 
    onUpdate: () => void,
    abortSignal: AbortSignal
  ) {
    if (chat.isGenerating) return;
    chat.isGenerating = true;

    try {
      const mcpTools = this.dispatcher.generateToolList(serverInstances);
      let iteration = 0;
      let isLooping = true;

      while (isLooping && iteration < this.MAX_ITERATIONS) {
        iteration++;

        // 1. Создаем заглушку ассистента с реактивным обновлением
        const assistantIdx = chat.history.length;
        chat.history = [...chat.history, {
          role: 'assistant',
          text: '', 
          tool_calls: []
        }];
        onUpdate();

        // 2. Делаем запрос к LM Studio со стримингом
        const responseData = await this.fetchLLMResponse(
          chat.history.slice(0, -1), // Не отправляем последнюю пустую заглушку
          settings, 
          mcpTools,
          (updatedText) => {
            // ВАЖНО: Обновляем массив целиком для триггера реактивности Svelte 5
            chat.history[assistantIdx].text = updatedText;
            chat.history = [...chat.history]; 
            onUpdate();
          },
          abortSignal
        );
        
        // Финализируем данные после окончания стрима
        chat.history[assistantIdx].text = responseData.content;
        chat.history[assistantIdx].tool_calls = responseData.tool_calls || [];
        chat.history = [...chat.history];
        onUpdate();

        const assistantMsg = chat.history[assistantIdx];

        // 3. Проверка инструментов
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          for (const call of assistantMsg.tool_calls) {
            try {
              const result = await this.dispatcher.callTool(call.name, call.arguments);
              chat.history = [...chat.history, {
                role: 'tool',
                text: JSON.stringify(result),
                tool_result: {
                  tool_call_id: call.id,
                  content: JSON.stringify(result, null, 2), // Форматируем JSON для виджета
                  isError: false
                }
              }];
            } catch (err: any) {
              chat.history = [...chat.history, {
                role: 'tool',
                text: `Error: ${err.message}`,
                tool_result: {
                  tool_call_id: call.id,
                  content: `Error: ${err.message}`,
                  isError: true
                }
              }];
            }
          }
          onUpdate();
        } else {
          isLooping = false;
        }
      }

      if (iteration >= this.MAX_ITERATIONS) {
        console.warn("ChatService: Достигнут лимит итераций");
      }

    } catch (error: any) {
      // Проверяем, была ли это отмена пользователем
      const isAbort = error.name === 'AbortError' || abortSignal.aborted;

      // Находим индекс нашего текущего сообщения-ассистента
      const assistantIdx = chat.history.findLastIndex(m => m.role === 'assistant');
      
      if (isAbort) {
        console.log("Генерация прервана пользователем");
        // Если прервали и ассистент пуст — удаляем его из истории
        if (assistantIdx !== -1) {
          const assistantMsg = chat.history[assistantIdx];
          if (!assistantMsg.text && (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0)) {
            chat.history.splice(assistantIdx, 1);
          } else {
            // Если текст был — помечаем как прерванное для Bubble
            assistantMsg.error = "Генерация прервана пользователем";
          }
        }
        toastService.show("Генерация прервана", "info");
      } else {
        console.error("Chat Error:", error);
        
        if (assistantIdx !== -1) {
          const assistantMsg = chat.history[assistantIdx];
          
          if (!assistantMsg.text && (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0)) {
            // Если сервер выдал ошибку СРАЗУ (пустой ответ), удаляем сообщение из истории
            chat.history.splice(assistantIdx, 1);
          } else {
            // Если текст уже успел накопиться — оставляем его, но добавляем баннер ошибки
            assistantMsg.error = error.message;
          }
        }
        
        // Показываем современное всплывающее уведомление вместо вставки текста в чат
        toastService.show(`Ошибка связи: ${error.message}`, "error");
      }
      
      // Синхронизируем массив истории
      chat.history = [...chat.history];
    } finally {
      chat.isGenerating = false;
      onUpdate();
    }
  }

  /**
   * Внутренний метод для работы с API LM Studio (OpenAI Compatible) со стримингом
   */
  private async fetchLLMResponse(
    history: Message[], 
    settings: WorkspaceSettings, 
    tools: any[],
    onUpdateText: (fullText: string) => void,
    abortSignal: AbortSignal
  ) {
    const apiMessages = [];
    if (settings.systemPrompt) {
      apiMessages.push({ role: 'system', content: settings.systemPrompt });
    }

    for (const msg of history) {
      // Пропускаем пустые сообщения, которые могли остаться от прошлых итераций
      if (msg.role === 'assistant' && !msg.text && (!msg.tool_calls || msg.tool_calls.length === 0)) continue;

      const openAIMsg: any = {
        role: msg.role,
        content: msg.text || null
      };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        openAIMsg.tool_calls = msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
        }));
      }
      if (msg.role === 'tool' && msg.tool_result) {
        openAIMsg.tool_call_id = msg.tool_result.tool_call_id;
        openAIMsg.content = msg.tool_result.content;
      }
      apiMessages.push(openAIMsg);
    }

    const baseUrl = settings.apiUrl.replace(/\/+$/, '');
    const fullUrl = `${baseUrl}/v1/chat/completions`;

    const requestBody: any = {
      model: settings.modelName,
      messages: apiMessages,
      temperature: settings.temperature,
      stream: true 
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.input_schema 
        }
      }));
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(fullUrl, {
      method: 'POST',
      signal: abortSignal, // <-- ВАЖНО: Привязываем сигнал к Tauri Fetch
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${settings.apiKey || 'lm-studio'}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API Error (${response.status}): ${errorData}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    let fullContent = "";
    let toolCallsRaw: any[] = [];

    if (reader) {
      while (true) {
        if (abortSignal.aborted) {
          await reader.cancel(); // Сообщаем потоку, что мы больше не читаем
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          // Дополнительная проверка внутри цикла обработки строк
          if (abortSignal.aborted) break;

          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                fullContent += delta.content;
                onUpdateText(fullContent); 
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index;
                  if (!toolCallsRaw[idx]) {
                    toolCallsRaw[idx] = { id: '', name: '', arguments: '' };
                  }
                  if (tc.id) toolCallsRaw[idx].id = tc.id;
                  if (tc.function?.name) toolCallsRaw[idx].name += tc.function.name;
                  if (tc.function?.arguments) toolCallsRaw[idx].arguments += tc.function.arguments;
                }
              }
            } catch (e) {
              // Игнорируем неполные чанки
            }
          }
        }
      }
    }

    return {
      content: fullContent,
      tool_calls: toolCallsRaw.length > 0 ? toolCallsRaw.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.arguments || '{}')
      })) : undefined
    };
  }
}
