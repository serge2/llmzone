// src/lib/services/chatService.ts
// import { fetch } from '@tauri-apps/plugin-http'; // ВАЖНО: Используем нативный fetch Tauri для обхода CORS
import { rustFetch as fetch } from '$lib/utils/rustFetch';
import { toastService } from '$lib/services/toastService.svelte';
import type { Message, Chat, WorkspaceSettings, ToolCall } from '$lib/types';
import { type MCPServerInstance, mcpManager } from '$lib/mcp/manager.svelte';
import { ProviderFactory } from './adapters/factory'; // ДОБАВЛЕН ИМПОРТ ФАБРИКИ
import type { ChatAdapter } from './adapters/interface';

// Импорт локализации
import * as m from '$paraglide/messages';

export class ChatService {
  private DEFAULT_MAX_ITERATIONS = 10;

  /**
   * Вспомогательный метод для выбора адаптера через фабрику
   */
  private getAdapter(providerType: string | undefined): ChatAdapter {
    // Используем централизованную фабрику для получения экземпляра адаптера
    return ProviderFactory.getAdapter(providerType as any);
  }

  /**
   * Метод для фильтрации настроек воркспейса на основе флагов "Enabled".
   * Оставляет в объекте только те параметры, которые разрешено отправлять в модель.
   */
  private getActiveSettings(settings: WorkspaceSettings): WorkspaceSettings {
    const activeSettings = { ...settings };

    // Маппинг ключей значений к их флагам активации
    const paramsMap: Array<[keyof WorkspaceSettings, keyof WorkspaceSettings]> = [
      ['temperature', 'temperatureEnabled'],
      ['maxCompletionTokens', 'maxCompletionTokensEnabled'],
      ['maxTokens', 'maxTokensEnabled'],
      ['topP', 'topPEnabled'],
      ['frequencyPenalty', 'frequencyPenaltyEnabled'],
      ['presencePenalty', 'presencePenaltyEnabled'],
      ['seed', 'seedEnabled'],
      ['topK', 'topKEnabled'],
      ['minP', 'minPEnabled'],
      ['repeatPenalty', 'repeatPenaltyEnabled'],
      ['contextLength', 'contextLengthEnabled'],
      ['reasoningEffort', 'reasoningEffortEnabled'],
      ['reasoning', 'reasoningEnabled'],
      ['verbosity', 'verbosityEnabled'],
    ];

    for (const [valKey, enabledKey] of paramsMap) {
      if (!settings[enabledKey]) {
        // Если опция выключена, удаляем значение из объекта для отправки
        delete activeSettings[valKey];
      }
    }

    return activeSettings;
  }

  /**
   * Метод для интеллектуальной генерации названия чата через адаптер
   */
  async generate_chat_title(chat: Chat, settings: WorkspaceSettings): Promise<string | 'SKIP'> {
    console.log("[ChatService] Attempting to generate title for chat:", chat.id);
    
    try {
      const adapter = this.getAdapter(settings.providerType);
      
      // Делегируем генерацию названия адаптеру, так как у каждого провайдера
      // (LM Studio, OpenAI, OpenRouter) свои нюансы работы с контекстом и эндпоинтами.
      return await adapter.generateChatTitle(chat.history, settings);
    } catch (e) {
      console.error("[ChatService] Title generation failed:", e);
      return 'SKIP';
    }
  }

  /**
   * Основной метод отправки сообщения с поддержкой цикла инструментов
   */
  async send(
    chat: Chat, 
    settings: WorkspaceSettings,
    serverInstances: MCPServerInstance[], 
    onUpdate: (metadata?: { promptProgress?: number | null; modelLoadProgress?: number | null }) => void,
    abortSignal: AbortSignal,
    onRename: (newName: string) => void
  ) {
    if (chat.isGenerating) return;
    chat.isGenerating = true;

    // Подготовка "чистых" настроек (только включенные опции)
    const activeSettings = this.getActiveSettings(settings);
    const adapter = this.getAdapter(activeSettings.providerType);
    
    let currentAssistantMsgIdx: number | null = null;
    let streamingMessageId: string | null = null; // Фиксация активного сообщения для предотвращения дублей
    
    // Переменная для хранения контекста адаптера между итерациями и стримом
    let requestContext: any = null;

    try {
      // ПРИМЕНЕНИЕ СИСТЕМНОГО ПРОМПТА И ИНСТРУКЦИЙ
      let fullSystemPrompt = activeSettings.systemPrompt || "";
      const shouldIncludeMcp = activeSettings.includeMcpInstructions ?? true;

      if (shouldIncludeMcp) {
        const wsId = serverInstances.length > 0 ? serverInstances[0].workspaceId : null;
        if (wsId) {
          const mcpInstructions = mcpManager.getFullSystemInstructions(wsId);
          if (mcpInstructions) fullSystemPrompt += (fullSystemPrompt ? "\n\n" : "") + mcpInstructions;
        }
      }

      if (activeSettings.followFirstMessage) {
        const firstUserMsg = chat.history.find(m => m.role === 'user');
        if (firstUserMsg?.text) {
          fullSystemPrompt += (fullSystemPrompt ? "\n\n" : "") + `### PRIMARY GOAL:\n${firstUserMsg.text}`;
        }
      }
      
      const maxIterations = (activeSettings.toolsLoopLimitEnabled ?? true) 
        ? (activeSettings.toolsMaxIterations ?? this.DEFAULT_MAX_ITERATIONS) 
        : Infinity;

      let iteration = 0;
      let isLooping = true;

      while (isLooping && iteration <= maxIterations) {
        if (abortSignal.aborted) break;
        iteration++;

        // --- ФИЛЬТРАЦИЯ ИНСТРУМЕНТОВ (БЕЗОПАСНАЯ) ---
        // Мы создаем обертку вокруг оригинального объекта сервера.
        const filteredServers = serverInstances
          .filter(s => s.enabled && s.isConnected)
          .map(server => {
            // Явно извлекаем инструменты, которые включены пользователем
            const activeTools = server.tools.filter((t: any) => t.enabled !== false);
            
            // Возвращаем DTO-объект, который гарантированно содержит нужные поля для адаптеров
            return {
              name: server.name,
              url: server.url,        // Явно прокидываем из $state
              headers: server.headers, // Явно прокидываем из $state
              autoApproveAll: server.autoApproveAll,
              tools: activeTools,
              // Сохраняем метод callTool через замыкание
              callTool: (name: string, args: any) => server.callTool(name, args)
            };
          })
          .filter(server => server.tools.length > 0);

        // Проверяем наличие инструментов, ожидающих подтверждения (для режима OpenAI)
        const lastMsg = chat.history[chat.history.length - 1];
        const hasExistingCalls = lastMsg?.role === 'assistant' && lastMsg.tool_calls && lastMsg.tool_calls.length > 0;

        if (hasExistingCalls) {
          currentAssistantMsgIdx = chat.history.length - 1;
          streamingMessageId = lastMsg.id;
          
          if (!requestContext) {
            const prep = adapter.preparePayload(
              chat.history.slice(0, -1), 
              activeSettings, // Используем отфильтрованные настройки
              filteredServers, // Используем отфильтрованные данные
              fullSystemPrompt
            );
            requestContext = prep.context;
          }
        } else {
          // Новая итерация - сбрасываем ID стриминга
          streamingMessageId = crypto.randomUUID();
          currentAssistantMsgIdx = chat.history.length;
          
          chat.history.push({
            id: streamingMessageId,
            role: 'assistant',
            text: '', 
            reasoning: '', 
            tool_calls: []
          });
          onUpdate();

          // 1. ПОДГОТОВКА PAYLOAD ЧЕРЕЗ АДАПТЕР (С ОТФИЛЬТРОВАННЫМИ ИНСТРУМЕНТАМИ)
          const { payload, context } = adapter.preparePayload(
            chat.history.slice(0, -1), 
            activeSettings, // Используем отфильтрованные настройки
            filteredServers, // Используем отфильтрованные данные
            fullSystemPrompt
          );
          
          requestContext = context;

          // 2. ЗАПРОС К API
          const response = await fetch(adapter.getEndpoint(activeSettings.apiUrl), {
            method: 'POST',
            headers: adapter.getHeaders(activeSettings),
            body: JSON.stringify(payload),
            signal: abortSignal
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(m.chat_error_api({ status: response.status.toString(), message: errorData }));
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let streamBuffer = "";

          if (reader) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done || abortSignal.aborted) break;

                streamBuffer += decoder.decode(value, { stream: true });
                const lines = streamBuffer.split('\n');
                streamBuffer = lines.pop() || "";

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  console.log("Trimmed:", trimmed);

                  try {
                    const chunk = adapter.parseStreamChunk(trimmed, requestContext);
                    console.log("Chunk:", chunk);
                    
                    // --- ОБРАБОТКА ПРОГРЕССА (LM Studio и др.) ---
                    if (chunk.promptProgress !== undefined) {
                      onUpdate({ promptProgress: chunk.promptProgress });
                      continue;
                    }

                    if (chunk.modelLoadProgress !== undefined) {
                      onUpdate({ modelLoadProgress: chunk.modelLoadProgress });
                      continue;
                    }

                    // Находим текущее сообщение строго по ID
                    let assistantMsg = chat.history.find(m => m.id === streamingMessageId);

                    // --- ОБРАБОТКА СПЕЦИФИЧНЫХ СИГНАЛОВ АВТОНОМНОГО АДАПТЕРА ---
                    if (chunk.isDone) {
                      if (assistantMsg) {
                        if (chunk.usage) assistantMsg.usage = chunk.usage;
                        if (chunk.responseId) {
                          assistantMsg.response_id = chunk.responseId;
                          console.log("Saved response_id:", assistantMsg.response_id)
                        }
                      }
                    }

                    if (chunk.toolResult) {
                      if (assistantMsg) {
                        const call = assistantMsg.tool_calls?.find(c => c.id === chunk.toolResult?.tool_call_id);
                        if (call) {
                          call.approvalStatus = chunk.toolResult.isError ? 'rejected' : 'approved';
                        }
                      }

                      chat.history.push({
                        id: crypto.randomUUID(),
                        role: 'tool',
                        text: '',
                        tool_result: chunk.toolResult
                      });
                      // После результата в автономном режиме сбрасываем привязку, если придет новое сообщение
                      streamingMessageId = null;
                    }

                    if (chunk.isNewMessage) {
                      streamingMessageId = crypto.randomUUID();
                      chat.history.push({
                        id: streamingMessageId,
                        role: 'assistant',
                        text: '',
                        reasoning: '',
                        tool_calls: []
                      });
                      assistantMsg = chat.history[chat.history.length - 1];
                    }

                    // --- ОБРАБОТКА КОНТЕНТА ---
                    if (chunk.content || chunk.reasoning || chunk.toolCalls) {
                      
                      if (!assistantMsg || assistantMsg.role !== 'assistant') {
                        // Если сообщения нет (например после toolResult), создаем новое
                        streamingMessageId = crypto.randomUUID();
                        chat.history.push({ id: streamingMessageId, role: 'assistant', text: '', reasoning: '', tool_calls: [] });
                        assistantMsg = chat.history[chat.history.length - 1];
                      }

                      if (chunk.content) assistantMsg.text += chunk.content;
                      if (chunk.reasoning) assistantMsg.reasoning += chunk.reasoning;
                      
                      
                      // МЯГКОЕ ОБНОВЛЕНИЕ ТУЛОВ (МЕРДЖ)
                      if (chunk.toolCalls) {
                        const updatedCalls = [...(assistantMsg.tool_calls || [])];
                        
                        chunk.toolCalls.forEach(newCall => {
                          const foundIdx = updatedCalls.findIndex(c => c.id === newCall.id);
                          
                          if (foundIdx !== -1) {
                            updatedCalls[foundIdx] = {
                              ...updatedCalls[foundIdx],
                              ...newCall,
                              server_name: newCall.server_name || updatedCalls[foundIdx].server_name,
                              tool_name: newCall.tool_name || updatedCalls[foundIdx].tool_name,
                              arguments: newCall.arguments ?? updatedCalls[foundIdx].arguments
                            };
                          } else {
                            updatedCalls.push({ ...newCall });
                          }
                        });
                        
                        assistantMsg.tool_calls = updatedCalls;
                      }
                    }

                    // При получении любого контента сбрасываем визуальные прогрессы
                    onUpdate({ promptProgress: null, modelLoadProgress: null });

                    if (chunk.isDone) break;
                  } catch (e) {
                    console.error("[ChatService] Error parsing stream line:", e);
                    continue; // Пропускаем битую строку и не вешаем сервис
                  }
                }
              }
            } finally {
              // ВАЖНО: Освобождаем reader в любом случае (успех или ошибка)
              reader.releaseLock();
            }
          }

          if (abortSignal.aborted) break;
        }

        // 3. ОБРАБОТКА ИНСТРУМЕНТОВ (ДИРИЖИРОВАНИЕ)
        const currentAssistantMsg = chat.history.find(m => m.id === streamingMessageId);
        const assistantMsg = currentAssistantMsg || chat.history[chat.history.length - 1];
        
        if (adapter.isAutonomous) {
            isLooping = false;
            break;
        }

        if (assistantMsg && assistantMsg.role === 'assistant' && assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
          if (iteration > maxIterations) {
            assistantMsg.requiresLimitExtension = true;
            isLooping = false;
            break; 
          }

          let needsUserApproval = false;

          for (const call of assistantMsg.tool_calls as ToolCall[]) {
            if (call.approvalStatus === 'approved' || call.approvalStatus === 'rejected') continue;
            
            // ПРЯМОЙ ПОИСК В СПИСКЕ СЕРВЕРОВ (БЕЗ КОНТЕКСТА АДАПТЕРА)
            const targetServer = filteredServers.find(s => s.name === call.server_name);
            const targetTool = targetServer?.tools.find((t: any) => t.name === call.tool_name);

            if (targetServer && targetTool) {
              const isAuto = targetServer.autoApproveAll || targetTool.alwaysAllow;
              
              if (!isAuto) {
                call.approvalStatus = 'pending';
                needsUserApproval = true;
              } else {
                call.approvalStatus = 'approved';
              }
            }
          }

          if (needsUserApproval) {
            chat.isGenerating = false;
            onUpdate();
            return; 
          }

          for (const call of assistantMsg.tool_calls as ToolCall[]) {
            if (abortSignal.aborted) break;
            const existingResult = chat.history.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === call.id);
            if (existingResult) continue;

            if (call.approvalStatus === 'rejected') {
              chat.history.push({
                id: crypto.randomUUID(),
                role: 'tool',
                text: '',
                tool_result: { tool_call_id: call.id, content: m.chat_tool_error_rejected(), isError: true }
              });
              continue;
            }

            try {
              // ПРЯМОЙ ВЫЗОВ НА ОСНОВЕ РАЗДЕЛЬНЫХ ИМЕН
              const targetServer = filteredServers.find(s => s.name === call.server_name);
              if (!targetServer) throw new Error(m.chat_error_tool_not_found({ name: `${call.server_name}:${call.tool_name}` }));

              const result = await targetServer.callTool(call.tool_name, call.arguments);
              
              chat.history.push({
                id: crypto.randomUUID(),
                role: 'tool',
                text: '',
                tool_result: { 
                    tool_call_id: call.id, 
                    content: JSON.stringify(result, null, 2), 
                    isError: (result as any).isError === true 
                }
              });
            } catch (err: any) {
              chat.history.push({
                id: crypto.randomUUID(),
                role: 'tool',
                text: '', 
                tool_result: { tool_call_id: call.id, content: `Error: ${err.message}`, isError: true }
              });
            }
          }
          onUpdate();
        } else {
          isLooping = false;
        }
      }

      // ЛОГИКА АВТОМАТИЧЕСКОГО ПЕРЕИМЕНОВАНИЯ
      if (activeSettings.autoRenameEnabled && chat.is_untitled && !abortSignal.aborted) {
        this.generate_chat_title(chat, activeSettings).then(new_title => {
          if (new_title && new_title !== 'SKIP') {
            console.log("[ChatService] New title suggested:", new_title);
            onRename(new_title);
          }
        });
      }

    } catch (error: any) {
      if (error.name !== 'AbortError' && !abortSignal.aborted) {
        toastService.show(m.chat_toast_conn_error({ message: error.message }), "error");
        const lastMsg = chat.history[chat.history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') lastMsg.error = error.message;
      }
    } finally {
      chat.isGenerating = false;
      onUpdate({ promptProgress: null, modelLoadProgress: null }); // Сброс при любом исходе
    }
  }
}
