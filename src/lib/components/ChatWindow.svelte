<script lang="ts">
  import type { Message, Attachment } from '$lib/types';
  import MessageBubble from './chat/MessageBubble.svelte';
  import ChatInput from './chat/ChatInput.svelte'; // Импорт нового компонента
  import { tick, onMount } from 'svelte';

  // --- Система локализации ---
  import * as m from '$paraglide/messages';

  // Импорт иконок
  import ChevronDownIcon from '$lib/assets/icons/chevron-down.svg?raw';
  import CpuIcon from '$lib/assets/icons/cpu.svg?raw'; 

  let { 
    history, 
    currentLocale, 
    isGenerating,
    isLoading = false, // НОВОЕ: состояние загрузки истории с диска
    message = $bindable(),
    onSendMessage,
    onEditMessage,
    onCopyMessage,
    onDeleteMessage,
    onRegenerateMessage,
    onApproveTool,
    onExtendLimit 
  } = $props<{
    history: Message[];
    currentLocale: string;
    isGenerating: boolean;
    isLoading?: boolean; // Типизация нового пропа
    message: string;
    onSendMessage: (attachments?: Attachment[]) => void;
    onEditMessage: (index: number, newText: string) => void;
    onCopyMessage: (text: string) => void;
    onDeleteMessage: (index: number) => void;
    onRegenerateMessage: () => void;
    onApproveTool?: (callId: string, status: 'approved' | 'rejected') => void;
    onExtendLimit: () => void;
  }>();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  // Ссылка на компонент ввода для вызова метода focus()
  let inputComponent = $state<ReturnType<typeof ChatInput>>();

  // --- ЛОГИКА ОПРЕДЕЛЕНИЯ СТАТУСА ГЕНЕРАЦИИ ---
  const generationStatus = $derived.by(() => {
    if (!isGenerating) return null;
    
    const lastMsg = history[history.length - 1];
    if (!lastMsg) return 'thinking';

    // Если сообщение требует расширения лимита, ИИ фактически уже не "генерирует" активный процесс
    // Это важно, чтобы UI не показывал бесконечную анимацию выполнения, когда всё стоит на паузе
    if (lastMsg.requiresLimitExtension) return null;

    // 1. Проверяем, есть ли вызовы инструментов, которые еще не получили ответа
    const hasPendingTools = lastMsg.tool_calls?.some((call: any) => 
      !history.find((h: Message) => h.role === 'tool' && h.tool_result?.tool_call_id === call.id)
    );

    if (hasPendingTools) return 'executing_tools';

    // 2. Если текст или рассуждения уже начали поступать — значит, идет печать
    if (lastMsg.text || (lastMsg.reasoning && lastMsg.reasoning.length > 0)) {
      return 'typing';
    }

    // 3. По умолчанию (запрос ушел, ответа еще нет) — стадия раздумий
    return 'thinking';
  });

  // Группировка сообщений
  let displayGroups = $derived.by(() => {
    const groups: { role: 'user' | 'assistant' | 'system'; messages: Message[]; startIndex: number }[] = [];
    
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role === 'user' || msg.role === 'system') {
        groups.push({ role: msg.role, messages: [msg], startIndex: i });
      } 
      else if (msg.role === 'assistant') {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.role === 'assistant') lastGroup.messages.push(msg);
        else groups.push({ role: 'assistant', messages: [msg], startIndex: i });
      } 
      else if (msg.role === 'tool') {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.role === 'assistant') lastGroup.messages.push(msg);
        else groups.push({ role: 'assistant', messages: [msg], startIndex: i });
      }
    }
    return groups;
  });

  let chatContainer: HTMLElement;
  let shouldAutoScroll = true;
  let showScrollButton = $state(false); 

  export async function scrollToBottom(force = false) {
    await tick();
    if (chatContainer && (shouldAutoScroll || force)) {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: force ? 'auto' : 'smooth'
      });
      if (force) {
        shouldAutoScroll = true;
        showScrollButton = false;
      }
    }
  }

  function handleScroll() {
    if (!chatContainer) return;
    const threshold = 150;
    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    shouldAutoScroll = distanceFromBottom < threshold;
    showScrollButton = distanceFromBottom > threshold;
  }

  onMount(() => {
    inputComponent?.focus();
    const resizeObserver = new ResizeObserver(() => {
      if (shouldAutoScroll && chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    });
    if (chatContainer) resizeObserver.observe(chatContainer);
    return () => resizeObserver.disconnect();
  });

  $effect(() => {
    if (history) {
      inputComponent?.focus();
    }
  });

  $effect(() => {
    const len = history.length;
    const lastMessage = len > 0 ? history[len - 1] : null;
    const lastMessageText = lastMessage?.text || '';
    const lastMessageReasoning = lastMessage?.reasoning || '';
    const generating = isGenerating;

    if (len || generating || lastMessageText || lastMessageReasoning) {
      scrollToBottom();
    }
  });

  // Следим за флагом лимита: когда он появляется в последнем сообщении, 
  // нужно принудительно прокрутить вниз, так как высота сообщения увеличилась
  $effect(() => {
    const lastMessage = history[history.length - 1];
    if (lastMessage?.requiresLimitExtension) {
      // Используем небольшую задержку, чтобы анимация slide успела начаться/отработать
      setTimeout(() => {
        scrollToBottom(true);
      }, 500);
    }
  });
  
</script>

<section class="chat-column">
  <div 
    class="messages-container" 
    bind:this={chatContainer} 
    onscroll={handleScroll}
  >
    {#if isLoading}
      <div class="welcome-screen loading-state">
        <div class="spinner"></div>
        <p>{_i18n && m.chat_loading()}...</p> 
      </div>
    {:else}
      {#if history.length === 0}
        <div class="welcome-screen">
          <div class="welcome-logo">{@html CpuIcon}</div>
          <h2 class="welcome-text">{_i18n && m.chat_welcome_submessage()}</h2>
        </div>
      {:else}
        <div class="messages-list">
          {#each displayGroups as group (group.startIndex)}
            <MessageBubble 
              currentLocale={currentLocale}
              role={group.role}
              messages={group.messages}
              isLastMessage={group.startIndex + group.messages.length >= history.length}
              isTyping={isGenerating && (group.startIndex + group.messages.length >= history.length)}
              status={group.startIndex + group.messages.length >= history.length ? generationStatus : null}
              fullHistory={history} 
              onEdit={(newText) => onEditMessage(group.startIndex, newText)}
              onCopy={() => {
                const fullText = group.messages.map(m => m.text).filter(Boolean).join('\n\n');
                onCopyMessage(fullText);
              }}
              onDelete={() => onDeleteMessage(group.startIndex)}
              onRegenerate={() => onRegenerateMessage()}
              onApproveTool={onApproveTool} 
              onExtendLimit={onExtendLimit}  />
          {/each} 
        </div>
      {/if}
    {/if}

    {#if showScrollButton}
      <button 
        class="scroll-down-btn" 
        onclick={() => scrollToBottom(true)}
        aria-label={_i18n && m.chat_scroll_to_bottom()}
      >
        {@html ChevronDownIcon}
      </button>
    {/if}
  </div>

  <ChatInput 
    bind:this={inputComponent}
    {currentLocale}
    isGenerating={isGenerating || isLoading}
    bind:message={message}
    onSendMessage={onSendMessage}
  />
</section>

<style>
  .chat-column { 
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    background: #fdfdfd; 
    height: 100vh;
    position: relative;
  }

  .messages-container { 
    flex: 1; 
    overflow-y: auto; 
    padding: 0 5%; 
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Исправление для системных скроллбаров при открытии настроек */
  :global(body:has(.settings-overlay)) .messages-container {
    display: none !important;
  }

  .welcome-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    opacity: 0.8;
  }

  .loading-state {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #f3f4f6;
    border-top: 3px solid #5865f2;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .welcome-logo {
    width: 64px;
    height: 64px;
    color: #5865f2;
    background: #f5f3ff;
    padding: 16px;
    border-radius: 20px;
  }

  .welcome-logo :global(svg) {
    width: 100%;
    height: 100%;
  }

  .welcome-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
    text-align: center;
  }

  .messages-list {
    max-width: 1000px;
    margin: 0 auto;
    padding: 20px 0;
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .scroll-down-btn {
    position: sticky;
    left: 100%;
    bottom: 20px;
    transform: translateX(20px); 
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    aspect-ratio: 1 / 1;
    min-width: 32px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #e5e7eb;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #6b7280;
    z-index: 10;
    margin-bottom: 20px;
    transition: all 0.2s;
  }

  .scroll-down-btn:hover {
    background-color: #f9fafb;
    color: #1f2937;
  }

  .scroll-down-btn :global(svg) {
    width: 18px;
    height: 18px;
  }
</style>
