// src/lib/services/chatService.ts
import { fetch } from '@tauri-apps/plugin-http'; // ВАЖНО: Используем нативный fetch Tauri для обхода CORS
import { toastService } from '$lib/services/toastService.svelte';
import type { Message, Chat, WorkspaceSettings } from '$lib/types';
import type { MCPServerInstance } from '$lib/mcp/manager.svelte';

export class ChatService {
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

    // Храним индекс сообщения текущей итерации
    let currentAssistantMsgIdx: number | null = null;

    try {
      // КАРТА ДЛЯ ОБРАТНОГО ПОИСКА: "уникальное_имя" => { инстанс_сервера, оригинальное_имя_функции }
      const toolLookupMap = new Map<string, { server: MCPServerInstance; originalName: string }>();
      
      // Формируем список инструментов для API с дедупликацией имен
      const mcpTools = serverInstances
        .filter(s => s.enabled)
        .flatMap(server => {
          return server.tools
            .filter(t => t.enabled)
            .map(tool => {
              let baseName = `${tool.name}`;
              // let baseName = `${server.name}___${tool.name}`; Some models can't use tolls with complex names
              let uniqueName = baseName;
              let counter = 1;

              // ЛОГИКА ДЕДУПЛИКАЦИИ: проверяем наличие ключа и добавляем цифровой суффикс
              while (toolLookupMap.has(uniqueName)) {
                uniqueName = `${baseName}${counter}`;
                counter++;
              }

              // Сохраняем связь в мапу для последующего вызова
              toolLookupMap.set(uniqueName, { 
                server: server, 
                originalName: tool.name 
              });

              return {
                name: uniqueName,
                description: tool.description,
                input_schema: tool.inputSchema
              };
            });
        });

      let iteration = 0;
      let isLooping = true;

      while (isLooping && iteration < this.MAX_ITERATIONS) {
        iteration++;

        // 1. Добавляем сообщение напрямую через push. 
        // В Svelte 5 это триггерит реактивность автоматически.
        currentAssistantMsgIdx = chat.history.length;
        chat.history.push({
          role: 'assistant',
          text: '', 
          tool_calls: []
        });
        onUpdate();

        // 2. Делаем запрос к LM Studio со стримингом
        const responseData = await this.fetchLLMResponse(
          chat.history.slice(0, -1), // Для слайса копия допустима, так как это данные для API
          settings, 
          mcpTools,
          (updatedText) => {
            if (currentAssistantMsgIdx !== null) {
              // Прямая мутация свойства. Svelte 5 обновит только текстовый узел в UI.
              chat.history[currentAssistantMsgIdx].text = updatedText;
              onUpdate();
            }
          },
          (updatedTools) => {
            // НОВОЕ: Стриминг инструментов в реальном времени
            if (currentAssistantMsgIdx !== null) {
              chat.history[currentAssistantMsgIdx].tool_calls = updatedTools;
              onUpdate();
            }
          },
          abortSignal
        );

        // ПРОВЕРКА: Если ответ пустой
        if (!responseData || (!responseData.content && (!responseData.tool_calls || responseData.tool_calls.length === 0))) {
          throw new Error("Модель вернула пустой ответ или не поддерживает данный формат сообщений");
        }
        
        // Финализируем данные после окончания стрима через прямые мутации
        if (currentAssistantMsgIdx !== null) {
          chat.history[currentAssistantMsgIdx].text = responseData.content;
          chat.history[currentAssistantMsgIdx].tool_calls = responseData.tool_calls || [];
          onUpdate();

          const assistantMsg = chat.history[currentAssistantMsgIdx];

          // 3. Проверка инструментов
          if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            for (const call of assistantMsg.tool_calls) {
              try {
                // ПОИСК ОРИГИНАЛЬНОГО ИНСТРУМЕНТА ПО УНИКАЛЬНОМУ ИМЕНИ
                const toolBinding = toolLookupMap.get(call.name);

                if (!toolBinding) {
                  throw new Error(`Инструмент "${call.name}" не найден в карте вызовов`);
                }

                // Вызов через оригинальный сервер и оригинальное имя функции
                const result = await toolBinding.server.callTool(toolBinding.originalName, call.arguments);
                
                // Снова используем push вместо пересоздания всего массива
                chat.history.push({
                  role: 'tool',
                  text: JSON.stringify(result),
                  tool_result: {
                    tool_call_id: call.id,
                    content: JSON.stringify(result, null, 2),
                    isError: false
                  }
                });
              } catch (err: any) {
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
            // Сбрасываем индекс перед следующей итерацией (будет создан новый ассистент)
            currentAssistantMsgIdx = null; 
          } else {
            isLooping = false;
          }
        }
      }

      if (iteration >= this.MAX_ITERATIONS) {
        console.warn("ChatService: Достигнут лимит итераций");
      }

    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || abortSignal.aborted;
      
      if (isAbort) {
        console.log("Генерация прервана пользователем");
        toastService.show("Генерация прервана", "info");
      } else {
        console.error("Chat Error:", error);
        toastService.show(`Ошибка связи: ${error.message}`, "error");
      }

      // ЛОГИКА ОЧИСТКИ ИНТЕРФЕЙСА:
      if (currentAssistantMsgIdx !== null) {
        const assistantMsg = chat.history[currentAssistantMsgIdx];
        
        // Если сообщение пустое (ошибка случилась до получения текста) — удаляем его
        const hasNoText = !assistantMsg.text || assistantMsg.text.trim() === '';
        const hasNoTools = !assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0;

        if (hasNoText && hasNoTools) {
          // Используем splice для удаления элемента — Svelte 5 это увидит
          chat.history.splice(currentAssistantMsgIdx, 1);
        } else if (!isAbort) {
          assistantMsg.error = error.message;
        }
      }
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
    onUpdateTools: (tools: any[]) => void, // Добавлен колбэк для стриминга инструментов
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

      // ЛОГИКА ДЛЯ ИНСТРУМЕНТА И КАРТИНКИ
      if (msg.role === 'tool' && msg.tool_result) {
        openAIMsg.tool_call_id = msg.tool_result.tool_call_id;
        
        try {
          // 1. Парсим строку из content, которая содержит { "content": [...] }
          const outerData = JSON.parse(msg.tool_result.content);
          
          // 2. Ищем объект с типом 'image' внутри массива content
          const imageItem = Array.isArray(outerData.content) 
            ? outerData.content.find((item: any) => item.type === 'image')
            : null;
          
          if (imageItem && imageItem.data) {
            // Отправляем текстовое подтверждение в роль tool
            openAIMsg.content = "Изображение получено.";
            apiMessages.push(openAIMsg);

            // 3. Добавляем сообщение от пользователя с картинкой для ЛЛМ
            let imagesRecords : any = [];
            for (const record of outerData.content) {
              if (record.type === 'image') {
                imagesRecords = [...imagesRecords, {
                  type: 'image_url', image_url: { url: `data:${record.mimeType};base64,${record.data}`}
                }]
              }
            };

            apiMessages.push({
              role: 'user',
              content: [
                { type: 'text', text: 'Вот изображение(я), которое вернул инструмент:' },
                ...imagesRecords
              ]
            });
            continue; 
          }
        } catch (e) {
          // Если это не JSON или структура не совпала — идем по обычному пути
        }

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
        'Authorization': `Bearer ${settings.apiKey || 'noauth'}`
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

                // ВАЖНО: Мгновенно обновляем UI при получении чанков инструментов
                const currentTools = toolCallsRaw.map(tc => {
                    let parsedArgs = {};
                    try {
                        // Пытаемся парсить аргументы только если они выглядят как полный JSON
                        if (tc.arguments.trim().endsWith('}')) {
                            parsedArgs = JSON.parse(tc.arguments);
                        }
                    } catch (e) { /* Игнорируем ошибки парсинга неполного JSON в процессе стриминга */ }
                    
                    return {
                        id: tc.id,
                        name: tc.name,
                        arguments: parsedArgs,
                        raw_arguments: tc.arguments // ПЕРЕДАЕМ СЫРУЮ СТРОКУ
                    };
                });
                onUpdateTools(currentTools);
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
