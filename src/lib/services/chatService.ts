// src/lib/services/chatService.ts
import { fetch } from '@tauri-apps/plugin-http'; // ВАЖНО: Используем нативный fetch Tauri для обхода CORS
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
   * Метод для интеллектуальной генерации названия чата
   */
  async generate_chat_title(chat: Chat, settings: WorkspaceSettings): Promise<string | 'SKIP'> {
    console.log("[ChatService] Attempting to generate title for chat:", chat.id);
    
    const adapter = this.getAdapter(settings.providerType);
    const full_url = adapter.getEndpoint(settings.apiUrl);

    const analysis_history = chat.history
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.text)
      .slice(0, 3)
      .map(msg => ({ role: msg.role, content: msg.text }));

    if (analysis_history.length < 1) return 'SKIP';

    const system_prompt = `Analyze the conversation. If a specific topic has been established, provide a concise (2-4 words) title for this chat. 
  The title MUST be in the same language the user is speaking.
  If the conversation is just greetings, empty talk, or hasn't started a real topic yet, respond ONLY with the word "SKIP".
  Do not use quotes, bold text, or punctuation.`;

    try {
      const response = await fetch(full_url, {
        method: 'POST',
        headers: adapter.getHeaders(settings),
        body: JSON.stringify({
          model: settings.modelName,
          messages: [
            { role: 'system', content: system_prompt },
            ...analysis_history
          ],
          temperature: 0.1,
          max_tokens: 25,
          stream: false // Для заголовка стрим не нужен
        })
      });

      if (!response.ok) return 'SKIP';
      const data = await response.json();
      
      const result = data.choices?.[0]?.message?.content?.trim();

      if (!result || result.toUpperCase().includes('SKIP')) return 'SKIP';
      return result.replace(/["']/g, '');
    } catch (e) {
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
    onUpdate: () => void,
    abortSignal: AbortSignal
  ) {
    if (chat.isGenerating) return;
    chat.isGenerating = true;

    const adapter = this.getAdapter(settings.providerType);
    let currentAssistantMsgIdx: number | null = null;
    let streamingMessageId: string | null = null; // Фиксация активного сообщения для предотвращения дублей
    
    // Переменная для хранения контекста адаптера между итерациями и стримом
    let requestContext: any = null;

    try {
      // ПРИМЕНЕНИЕ СИСТЕМНОГО ПРОМПТА И ИНСТРУКЦИЙ
      let fullSystemPrompt = settings.systemPrompt || "";
      const shouldIncludeMcp = settings.includeMcpInstructions ?? true;

      if (shouldIncludeMcp) {
        const wsId = serverInstances.length > 0 ? serverInstances[0].workspaceId : null;
        if (wsId) {
          const mcpInstructions = mcpManager.getFullSystemInstructions(wsId);
          if (mcpInstructions) fullSystemPrompt += (fullSystemPrompt ? "\n\n" : "") + mcpInstructions;
        }
      }

      if (settings.followFirstMessage) {
        const firstUserMsg = chat.history.find(m => m.role === 'user');
        if (firstUserMsg?.text) {
          fullSystemPrompt += (fullSystemPrompt ? "\n\n" : "") + `### PRIMARY GOAL:\n${firstUserMsg.text}`;
        }
      }
      
      const maxIterations = (settings.toolsLoopLimitEnabled ?? true) 
        ? (settings.toolsMaxIterations ?? this.DEFAULT_MAX_ITERATIONS) 
        : Infinity;

      let iteration = 0;
      let isLooping = true;

      while (isLooping && iteration <= maxIterations) {
        if (abortSignal.aborted) break;
        iteration++;

        // Проверяем наличие инструментов, ожидающих подтверждения (для режима OpenAI)
        const lastMsg = chat.history[chat.history.length - 1];
        const hasExistingCalls = lastMsg?.role === 'assistant' && lastMsg.tool_calls && lastMsg.tool_calls.length > 0;

        if (hasExistingCalls) {
          currentAssistantMsgIdx = chat.history.length - 1;
          streamingMessageId = lastMsg.id;
          
          if (!requestContext) {
            const prep = adapter.preparePayload(
              chat.history.slice(0, -1), 
              settings, 
              serverInstances,
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

          // 1. ПОДГОТОВКА PAYLOAD ЧЕРЕЗ АДАПТЕР
          const { payload, context } = adapter.preparePayload(
            chat.history.slice(0, -1), 
            settings, 
            serverInstances,
            fullSystemPrompt
          );
          
          requestContext = context;

          // 2. ЗАПРОС К API
          const response = await fetch(adapter.getEndpoint(settings.apiUrl), {
            method: 'POST',
            headers: adapter.getHeaders(settings),
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

                  try {
                    const chunk = adapter.parseStreamChunk(trimmed, requestContext);
                    
                    // Находим текущее сообщение строго по ID
                    let assistantMsg = chat.history.find(m => m.id === streamingMessageId);

                    // --- ОБРАБОТКА СПЕЦИФИЧНЫХ СИГНАЛОВ АВТОНОМНОГО АДАПТЕРА ---

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
                              name: newCall.name || updatedCalls[foundIdx].name,
                              arguments: newCall.arguments ?? updatedCalls[foundIdx].arguments
                            };
                          } else {
                            updatedCalls.push({ ...newCall });
                          }
                        });
                        
                        assistantMsg.tool_calls = updatedCalls;
                      }

                      if (chunk.usage) assistantMsg.usage = chunk.usage;
                      
                      const chunkAny = chunk as any;
                      if (chunkAny.response_id) {
                        (assistantMsg as any).response_id = chunkAny.response_id;
                      }
                    }

                    onUpdate();

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
            
            const toolBinding = requestContext?.toolLookupMap?.get(call.name);
            if (toolBinding) {
              const isAuto = toolBinding.server.autoApproveAll || 
                           toolBinding.server.tools.find((t: any) => t.name === toolBinding.originalName)?.alwaysAllow;
              
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
              const toolBinding = requestContext?.toolLookupMap?.get(call.name);
              if (!toolBinding) throw new Error(m.chat_error_tool_not_found({ name: call.name }));

              const result = await toolBinding.server.callTool(toolBinding.originalName, call.arguments);
              
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

      if (settings.autoRenameEnabled && chat.is_untitled && !abortSignal.aborted) {
        this.generate_chat_title(chat, settings).then(new_title => {
          if (new_title !== 'SKIP') {
            chat.name = new_title;
            chat.is_untitled = false;
            onUpdate();
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
      onUpdate();
    }
  }
}
