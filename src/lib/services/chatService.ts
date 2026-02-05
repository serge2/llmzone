// chatService.ts
import { fetch } from '@tauri-apps/plugin-http'; // ВАЖНО: Используем нативный fetch Tauri для обхода CORS
import { toastService } from '$lib/services/toastService.svelte';
import type { Message, Chat, WorkspaceSettings, ToolCall } from '$lib/types';
import { type MCPServerInstance, mcpManager } from '$lib/mcp/manager.svelte';

// Импорт локализации
import * as m from '$paraglide/messages';

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
        .filter(s => s.enabled && s.isConnected)
        .flatMap(server => {
          return server.tools
            .filter(t => t.enabled)
            .map(tool => {
              // 1. Очистка имен от запрещенных символов
              const sName = server.name.replace(/[^a-zA-Z0-9_-]/g, '_');
              const tName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
              
              // 2. Формируем базовое имя в нижнем регистре
              let baseName = `${sName}_${tName}`.toLowerCase();

              // 3. Защита от длины 64 символа (оставляем запас под суффиксы типа _10)
              if (baseName.length > 60) {
                baseName = baseName.substring(0, 60);
              }

              let uniqueName = baseName;
              let counter = 1;

              // 4. Логика дедупликации
              while (toolLookupMap.has(uniqueName)) {
                const suffix = `${counter}`;
                // Если при добавлении суффикса вылетаем за 64, еще немного подрезаем базу
                if ((baseName.length + suffix.length) > 64) {
                  uniqueName = baseName.substring(0, 64 - suffix.length) + suffix;
                } else {
                  uniqueName = baseName + suffix;
                }
                counter++;
              }

              // 5. Финальная регистрация
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

      
      // Собираем базовый промпт и инструкции MCP один раз перед началом генерации
      let fullSystemPrompt = settings.systemPrompt || "";
      const mcpInstructions = mcpManager.getFullSystemInstructions();
      if (mcpInstructions) {
        fullSystemPrompt += (fullSystemPrompt ? "\n\n" : "") + mcpInstructions;
      }

      // ЛОГИКА ФОКУСА НА ПЕРВОМ СООБЩЕНИИ (Anchor first user message)
      if (settings.followFirstMessage) {
        const firstUserMsg = chat.history.find(m => m.role === 'user');
        if (firstUserMsg && firstUserMsg.text) {
          fullSystemPrompt += (fullSystemPrompt ? "\n\n" : "") + 
            `### PRIMARY GOAL / TASK FOCUS:\n${firstUserMsg.text}`;
        }
      }
      
      let iteration = 0;
      let isLooping = true;

      while (isLooping && iteration < this.MAX_ITERATIONS) {
        // ПРОВЕРКА ПРЕРЫВАНИЯ: Останавливаем цикл, если получен сигнал
        if (abortSignal.aborted) break;

        iteration++;

        // Проверяем, есть ли уже в последнем сообщении инструменты, ожидающие выполнения или подтверждения
        const lastMsg = chat.history[chat.history.length - 1];
        const hasExistingCalls = lastMsg?.role === 'assistant' && lastMsg.tool_calls && lastMsg.tool_calls.length > 0;

        if (hasExistingCalls) {
          // Если мы зашли в send, а инструменты уже есть — значит мы продолжаем после паузы (напр. после аппрува)
          currentAssistantMsgIdx = chat.history.length - 1;
        } else {
          // Стандартный путь: создаем новое сообщение для ответа ассистента
          currentAssistantMsgIdx = chat.history.length;
          chat.history.push({
            id: crypto.randomUUID(), // Исправлено: добавлен уникальный ID
            role: 'assistant',
            text: '', 
            reasoning: '', 
            tool_calls: []
          });
          onUpdate();

          // ПОДГОТОВКА ИСТОРИИ ДЛЯ ЗАПРОСА
          const requestHistory = chat.history.slice(0, -1);

          // ИНЪЕКЦИЯ ПРЕДУПРЕЖДЕНИЯ ПРИ ПРИБЛИЖЕНИИ К ЛИМИТУ
          if (iteration === this.MAX_ITERATIONS) {
            requestHistory.push({
              id: 'system-limit-warning',
              role: 'user',
              text: "[SYSTEM MESSAGE]: You have reached the maximum limit of tool execution steps. " + 
                    "You MUST now provide a final response to the user based on the data you already have. " + 
                    "Do not call any more tools."
            });
          }

          // 2. Делаем запрос к LM Studio со стримингом
          const responseData = await this.fetchLLMResponse(
            requestHistory,
            settings, 
            mcpTools,
            fullSystemPrompt, // Передаем заранее сформированный промпт
            (updatedText) => {
              if (currentAssistantMsgIdx !== null) {
                chat.history[currentAssistantMsgIdx].text = updatedText;
                onUpdate();
              }
            },
            (updatedReasoning) => {
              if (currentAssistantMsgIdx !== null) {
                chat.history[currentAssistantMsgIdx].reasoning = updatedReasoning;
                onUpdate();
              }
            },
            (updatedTools) => {
              if (currentAssistantMsgIdx !== null) {
                chat.history[currentAssistantMsgIdx].tool_calls = updatedTools;
                onUpdate();
              }
            },
            abortSignal
          );

          if (abortSignal.aborted) break;

          if (!responseData || (!responseData.content && !responseData.reasoning && (!responseData.tool_calls || responseData.tool_calls.length === 0))) {
            throw new Error(m.chat_error_empty_response());
          }
          
          if (currentAssistantMsgIdx !== null) {
            chat.history[currentAssistantMsgIdx].text = responseData.content;
            chat.history[currentAssistantMsgIdx].reasoning = responseData.reasoning;
            chat.history[currentAssistantMsgIdx].tool_calls = responseData.tool_calls || [];
            onUpdate();
          }
        }

        // 3. Обработка инструментов
        if (currentAssistantMsgIdx !== null) {
          const assistantMsg = chat.history[currentAssistantMsgIdx];

          if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
            
            // --- ПРОВЕРКА ЛИМИТА ПЕРЕД ВЫПОЛНЕНИЕМ НОВЫХ ВЫЗОВОВ ---
            if (iteration >= this.MAX_ITERATIONS) {
              console.warn("ChatService: Достигнут лимит итераций. Требуется подтверждение пользователя.");
              assistantMsg.requiresLimitExtension = true; // Флаг для UI: показать кнопку "Продолжить"
              isLooping = false;
              break; 
            }

            // --- ЛОГИКА ПОДТВЕРЖДЕНИЯ (Human-in-the-loop) ---
            let needsUserApproval = false;

            for (const call of assistantMsg.tool_calls as ToolCall[]) {
              // Явно приводим к ToolCall, чтобы избежать ошибки "no overlap"
              const currentStatus = call.approvalStatus as ToolCall['approvalStatus'];

              // Если статус уже окончательный, пропускаем проверку
              if (currentStatus === 'approved' || currentStatus === 'rejected') continue;

              const toolBinding = toolLookupMap.get(call.name);
              if (toolBinding) {
                const server = toolBinding.server;
                const toolDef = server.tools.find(t => t.name === toolBinding.originalName);
                
                // Проверяем: требует ли сервер или конкретный инструмент подтверждения
                const isAutoApprove = server.autoApproveAll || toolDef?.alwaysAllow;
                
                if (!isAutoApprove) {
                  // Если статус еще не задан, помечаем как ожидающий
                  if (!call.approvalStatus) {
                    call.approvalStatus = 'pending';
                  }
                  
                  // Если статус всё еще не 'approved', значит нужно вмешательство пользователя
                  if (call.approvalStatus !== 'approved') {
                    needsUserApproval = true;
                  }
                } else {
                  call.approvalStatus = 'approved';
                }
              }
            }

            // Если нашли хоть один инструмент, требующий подтверждения — ставим на паузу
            if (needsUserApproval) {
              chat.isGenerating = false;
              onUpdate();
              return; // Выход из метода send. Цикл прерван до реакции пользователя.
            }

            // --- ВЫПОЛНЕНИЕ ИНСТРУМЕНТОВ ---
            for (const call of assistantMsg.tool_calls as ToolCall[]) {
              if (abortSignal.aborted) break;

              // 1. ПЕРВООЧЕРЕДНАЯ ПРОВЕРКА: Пропускаем, если этот вызов уже имеет результат в истории
              const existingResult = chat.history.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === call.id);
              if (existingResult) continue;

              // 2. ОБРАБОТКА ОТКАЗА: Если результата нет, но статус "rejected"
              if (call.approvalStatus === 'rejected') {
                // Добавляем сообщение об отказе, чтобы модель знала об этом
                chat.history.push({
                  id: crypto.randomUUID(),
                  role: 'tool',
                  text: '',
                  tool_result: {
                    tool_call_id: call.id,
                    content: m.chat_tool_error_rejected(),
                    isError: true
                  }
                });
                continue;
              }

              // 3. ВЫПОЛНЕНИЕ: Если мы здесь, значит результата нет и вызов одобрен
              try {
                // ПОИСК ОРИГИНАЛЬНОГО ИНСТРУМЕНТА ПО УНИКАЛЬНОМУ ИМЕНИ
                const toolBinding = toolLookupMap.get(call.name);

                if (!toolBinding) {
                  throw new Error(m.chat_error_tool_not_found({ name: call.name }));
                }

                // Вызов через оригинальный сервер и оригинальное имя функции
                const result = await toolBinding.server.callTool(toolBinding.originalName, call.arguments);
                
                // ВНИМАНИЕ: MCP результат может сам содержать флаг isError
                const hasErrorInside = (result as any).isError === true;

                chat.history.push({
                  id: crypto.randomUUID(),
                  role: 'tool',
                  text: '',
                  tool_result: {
                    tool_call_id: call.id,
                    content: JSON.stringify(result, null, 2),
                    isError: hasErrorInside
                  }
                });
              } catch (err: any) {
                // ГЛОБАЛЬНАЯ ОБРАБОТКА ОШИБОК ИНСТРУМЕНТА (Сеть, отсутствие функции и т.д.)
                chat.history.push({
                  id: crypto.randomUUID(),
                  role: 'tool',
                  text: '', 
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
            
            // Если во время выполнения инструментов был нажат стоп — выходим из внешнего цикла
            if (abortSignal.aborted) {
              isLooping = false;
            }
          } else {
            isLooping = false;
          }
        }
      }

    } catch (error: any) {
      const isAbort = error.name === 'AbortError' || abortSignal.aborted;
      
      if (isAbort) {
        console.log("Генерация прервана пользователем");
        toastService.show(m.chat_toast_aborted(), "info");
      } else {
        console.error("Chat Error:", error);
        toastService.show(m.chat_toast_conn_error({ message: error.message }), "error");
      }

      // ЛОГИКА ОЧИСТКИ ИНТЕРФЕЙСА:
      if (currentAssistantMsgIdx !== null) {
        const assistantMsg = chat.history[currentAssistantMsgIdx];

        // Если сообщение пустое (ошибка случилась до получения текста) — удаляем его
        const hasNoText = !assistantMsg.text || assistantMsg.text.trim() === '';
        const hasNoReasoning = !assistantMsg.reasoning || assistantMsg.reasoning.trim() === '';
        const hasNoTools = !assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0;

        if (hasNoText && hasNoReasoning && hasNoTools) {
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
    finalSystemPrompt: string, // Принимаем уже сформированный промпт
    onUpdateText: (fullText: string) => void,
    onUpdateReasoning: (fullReasoning: string) => void, // Колбэк для стриминга рассуждений
    onUpdateTools: (tools: any[]) => void, // Добавлен колбэк для стриминга инструментов
    abortSignal: AbortSignal
  ) {
    const apiMessages = [];
    
    // ПРИМЕНЕНИЕ СИСТЕМНОГО ПРОМПТА
    if (finalSystemPrompt) {
      apiMessages.push({ role: 'system', content: finalSystemPrompt });
    }

     // --- ДОБАВЬТЕ ЭТОТ БЛОК ДЛЯ ДЕБАГА ---
    console.group("🚀 LLM REQUEST DEBUG");
    console.log("Follow First Message Active:", settings.followFirstMessage);
    console.log("Final System Prompt:", finalSystemPrompt);
    console.log("Full Messages Array:", apiMessages.concat(history.map(m => ({ role: m.role, content: m.text }))));
    console.groupEnd();
    // -------------------------------------
       
    for (const msg of history) {
      // Пропускаем пустые сообщения, которые могли остаться от прошлых итераций
      if (msg.role === 'assistant' && !msg.text && !msg.reasoning && (!msg.tool_calls || msg.tool_calls.length === 0)) continue;

      const openAIMsg: any = {
        role: msg.role
      };

      // ЛОГИКА ВЛОЖЕНИЙ И МУЛЬТИМОДАЛЬНОСТИ
      if (msg.role === 'user' && msg.attachments && msg.attachments.some(a => a.type === 'image')) {
        const content: any[] = [];

        // Добавляем текстовую часть, если она есть
        if (msg.text) {
          content.push({ type: 'text', text: msg.text });
        }

        // Добавляем изображения
        for (const attr of msg.attachments) {
          if (attr.type === 'image' && attr.base64) {
            content.push({
              type: 'image_url',
              image_url: { url: attr.base64 } // attr.base64 уже содержит "data:image/...;base64,..."
            });
          }
        }
        openAIMsg.content = content;
      } else {
        openAIMsg.content = msg.text || null;
      }

      // Добавляем reasoning если он есть (некоторые API поддерживают передачу обратно в историю)
      if (msg.reasoning) {
        openAIMsg.reasoning_content = msg.reasoning;
      }

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
            openAIMsg.content = m.chat_tool_image_received();
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
                { type: 'text', text: m.chat_tool_image_msg_prefix() },
                ...imagesRecords
              ]
            });
            continue; 
          }
        } catch (e) {/*Если это не JSON или структура не совпала — идем по обычному пути*/}
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
      throw new Error(m.chat_error_api({ status: response.status.toString(), message: errorData }));
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    let fullContent = "";
    let fullReasoning = "";
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
          if (abortSignal.aborted) break;

          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const delta = data.choices[0]?.delta;
              if (!delta) continue;

              // Обработка рассуждений (Reasoning Content)
              if (delta.reasoning_content) {
                fullReasoning += delta.reasoning_content;
                onUpdateReasoning(fullReasoning);
              }

              if (delta.reasoning) {
                fullReasoning += delta.reasoning;
                onUpdateReasoning(fullReasoning);
              }

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
              console.warn("Ошибка парсинга чанка:", e);
            }
          }
        }
      }
    }

    return {
      content: fullContent,
      reasoning: fullReasoning,
      tool_calls: toolCallsRaw.length > 0 ? toolCallsRaw.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.arguments || '{}')
      })) : undefined
    };
  }
}
