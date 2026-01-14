// src/lib/services/chatService.ts
import { fetch } from '@tauri-apps/plugin-http'; // ВАЖНО: Используем нативный fetch Tauri для обхода CORS
import { MCPDispatcher } from '$lib/mcp/dispatcher';
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
    onUpdate: () => void
  ) {
    if (chat.isGenerating) return;
    chat.isGenerating = true;

    try {
      // 1. Подготавливаем "Витрину" инструментов через диспетчер
      const mcpTools = this.dispatcher.generateToolList(serverInstances);

      let iteration = 0;
      let isLooping = true;

      while (isLooping && iteration < this.MAX_ITERATIONS) {
        iteration++;

        // 2. Делаем запрос к LM Studio (OpenAI-совместимый формат)
        const response = await this.fetchLLMResponse(
          chat.history, 
          settings, 
          mcpTools
        );
        
        // Добавляем ответ ассистента в историю
        const assistantMsg: Message = {
          role: 'assistant',
          text: response.content || '',
          tool_calls: response.tool_calls
        };
        
        chat.history.push(assistantMsg);
        onUpdate();

        // 3. Проверяем, нужно ли вызывать инструменты
        if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          // Выполняем все запрошенные вызовы параллельно или последовательно
          for (const call of assistantMsg.tool_calls) {
            try {
              // Шаг 5 нашего алгоритма: Диспетчер сам найдет сервер по техническому имени
              const result = await this.dispatcher.callTool(call.name, call.arguments);
              
              chat.history.push({
                role: 'tool',
                text: JSON.stringify(result),
                tool_result: {
                  tool_call_id: call.id,
                  content: JSON.stringify(result)
                }
              });
            } catch (err: any) {
              // Сообщаем ИИ об ошибке, чтобы он мог её исправить
              chat.history.push({
                role: 'tool',
                text: `Error: ${err.message}`,
                tool_result: {
                  tool_call_id: call.id,
                  content: `Error: ${err.message}`,
                  isError: true
                }
              });
            }
          }
          onUpdate();
          // Цикл продолжается: на следующей итерации ИИ увидит результаты инструментов
        } else {
          // Инструментов нет или ИИ закончил работу
          isLooping = false;
        }
      }

      if (iteration >= this.MAX_ITERATIONS) {
        console.warn("ChatService: Достигнут лимит итераций");
      }

    } catch (error: any) {
      console.error("Chat Error:", error);
      chat.history.push({
        role: 'system',
        text: `Ошибка связи с моделью: ${error.message}`
      });
    } finally {
      chat.isGenerating = false;
      onUpdate();
    }
  }

  /**
   * Внутренний метод для работы с API LM Studio (OpenAI Compatible)
   */
  private async fetchLLMResponse(
    history: Message[], 
    settings: WorkspaceSettings, 
    tools: any[]
  ) {
    // Формируем сообщения для API
    const apiMessages = [];

    // Добавляем системный промпт, если он есть
    if (settings.systemPrompt) {
      apiMessages.push({ role: 'system', content: settings.systemPrompt });
    }

    // Конвертируем историю в формат OpenAI
    for (const msg of history) {
      const openAIMsg: any = {
        role: msg.role,
        content: msg.text || null
      };

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        openAIMsg.tool_calls = msg.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }));
      }

      if (msg.role === 'tool' && msg.tool_result) {
        openAIMsg.tool_call_id = msg.tool_result.tool_call_id;
        openAIMsg.content = msg.tool_result.content;
      }

      apiMessages.push(openAIMsg);
    }

    // Убираем только лишние слеши в конце, чтобы путь склеился корректно
    const baseUrl = settings.apiUrl.replace(/\/+$/, '');
    
    // Прямая склейка без условий: ожидаем базовый URL (напр. http://localhost:1234)
    // Либо, если пользователь сам ввел /v1, он должен понимать, что в коде добавится еще один /v1
    const fullUrl = `${baseUrl}/v1/chat/completions`;

    // Подготовка тела запроса
    const requestBody: any = {
      model: settings.modelName,
      messages: apiMessages,
      temperature: settings.temperature,
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey || 'lm-studio'}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok || !data || data.error || !data.choices || !data.choices[0]) {
      console.error("Критическая ошибка API:", data);
      const errorDetail = data?.error?.message || data?.error || JSON.stringify(data);
      throw new Error(errorDetail || `Status ${response.status}`);
    }

    const message = data.choices[0].message;

    return {
      content: message.content,
      tool_calls: message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments)
      }))
    };
  }
}
