<script lang="ts">
  import type { Message, Attachment } from '$lib/types';
  import MessageBubble from './MessageBubble.svelte';
  import { tick, onMount } from 'svelte';

  // --- Система локализации ---
  import * as m from '$paraglide/messages';

  // Импорт иконок из ассетов
  import ArrowUpIcon from '$lib/assets/icons/arrow-up.svg?raw';
  import StopIcon from '$lib/assets/icons/stop.svg?raw';
  import ChevronDownIcon from '$lib/assets/icons/chevron-down.svg?raw';
  import PlusIcon from '$lib/assets/icons/plus.svg?raw'; 
  import CloseIcon from '$lib/assets/icons/close.svg?raw';
  import CpuIcon from '$lib/assets/icons/cpu.svg?raw'; // Используем как логотип приветствия

  let { 
    history, 
    currentLocale, // Принимаем реактивную руну для i18n
    isGenerating, 
    message = $bindable(),
    onSendMessage,
    onEditMessage,
    onCopyMessage,
    onDeleteMessage,
    onRegenerateMessage,
    onApproveTool // Обработчик подтверждения инструментов
  } = $props<{
    history: Message[];
    currentLocale: string;
    isGenerating: boolean;
    message: string;
    onSendMessage: (attachments?: Attachment[]) => void; // принимает аттачи
    onEditMessage: (index: number, newText: string) => void;
    onCopyMessage: (text: string) => void;
    onDeleteMessage: (index: number) => void;
    onRegenerateMessage: () => void;
    onApproveTool?: (callId: string, status: 'approved' | 'rejected') => void; // Добавлен тип
  }>();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  // --- ЛОГИКА ВЛОЖЕНИЙ ---
  let pendingAttachments = $state<Attachment[]>([]);
  let fileInput = $state<HTMLInputElement>();

  async function handleFileSelection(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        // Простая классификация типа
        let type: Attachment['type'] = 'other';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.includes('pdf') || file.type.includes('text') || file.type.includes('word')) type = 'document';
        else if (file.type.includes('zip') || file.type.includes('rar')) type = 'archive';
        
        pendingAttachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          mimeType: file.type,
          base64: base64,
          type
        });
      };
      reader.readAsDataURL(file);
    }
    if (fileInput) fileInput.value = ''; // Сброс для возможности повторного выбора
  }

  function removeAttachment(id: string) {
    pendingAttachments = pendingAttachments.filter(a => a.id !== id);
  }

  // Обертка над отправкой для учета вложений и обработки остановки
  function internalSendMessage() {
    if (isGenerating) {
      // ИСПРАВЛЕНО: Если идет генерация, вызываем функцию отправки (она обработает стоп в +page.svelte)
      onSendMessage([]);
    } else if (message.trim() || pendingAttachments.length > 0) {
      onSendMessage([...pendingAttachments]);
      pendingAttachments = []; // Очистка после отправки
    }
  }

  // Группировка сообщений для отображения в виде единых блоков
  let displayGroups = $derived.by(() => {
    const groups: { role: 'user' | 'assistant' | 'system'; messages: Message[]; startIndex: number }[] = [];
    
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      
      // Если сообщение от пользователя или системы — это всегда начало новой группы
      if (msg.role === 'user' || msg.role === 'system') {
        groups.push({ 
          role: msg.role, 
          messages: [msg], 
          startIndex: i 
        });
      } 
      // Если сообщение от ассистента
      else if (msg.role === 'assistant') {
        const lastGroup = groups[groups.length - 1];
        // Если последняя группа тоже от ассистента, добавляем в неё
        if (lastGroup && lastGroup.role === 'assistant') {
          lastGroup.messages.push(msg);
        } else {
          // Иначе создаем новую группу ассистента
          groups.push({ 
            role: 'assistant', 
            messages: [msg], 
            startIndex: i 
          });
        }
      } 
      // Если сообщение от инструмента (tool), оно ВСЕГДА приклеивается к последней группе ассистента
      else if (msg.role === 'tool') {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.role === 'assistant') {
          lastGroup.messages.push(msg);
        } else {
          // На случай, если ассистент не успел создать сообщение (редко, но бывает)
          groups.push({ 
            role: 'assistant', 
            messages: [msg], 
            startIndex: i 
          });
        }
      }
    }
    return groups;
  });

  let chatContainer: HTMLElement;
  let inputElement: HTMLTextAreaElement; // Ссылка на textarea для управления фокусом
  let shouldAutoScroll = true;
  let showScrollButton = $state(false); // Состояние видимости кнопки прокрутки

  // Функция для автоматической подстройки высоты
  function adjustHeight() {
    if (inputElement) {
      inputElement.style.height = 'auto'; // Сначала сбрасываем, чтобы получить реальный scrollHeight
      inputElement.style.height = `${inputElement.scrollHeight}px`;
    }
  }

  // Функция для установки фокуса с гарантированным срабатыванием
  function focusInput() {
    if (inputElement) {
      // Используем setTimeout, чтобы фокус сработал после того, как Svelte обновит DOM
      setTimeout(() => {
        inputElement.focus();
        adjustHeight(); // Подстраиваем высоту при фокусе (важно при смене чата)
      }, 0);
    }
  }

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
    
    // Показывать кнопку, если пользователь прокрутил вверх больше чем на порог
    showScrollButton = distanceFromBottom > threshold;
  }

  // Следим за изменением высоты контейнера при ресайзе окна
  onMount(() => {
    // Начальный фокус при загрузке страницы
    focusInput();

    const resizeObserver = new ResizeObserver(() => {
      if (shouldAutoScroll && chatContainer) {
        // Если чат прижат к низу, удерживаем его там при изменении размеров
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    });

    if (chatContainer) resizeObserver.observe(chatContainer);
    return () => resizeObserver.disconnect();
  });

  // Эффект срабатывает при каждом изменении истории (переключении чата)
  $effect(() => {
    // Нам нужно "коснуться" history, чтобы Svelte отслеживал этот эффект
    if (history) {
      focusInput();
    }
  });

  // Следим за сообщением, чтобы сбрасывать высоту после отправки
  $effect(() => {
    if (message === '') {
      adjustHeight();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    // Проверяем:
    // 1. Нажат Enter без Shift
    // 2. Мы НЕ в процессе генерации (чтобы не спамить)
    // 3. Сообщение НЕ пустое ИЛИ есть вложения
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isGenerating && (message.trim() || pendingAttachments.length > 0)) {
        e.preventDefault();
        internalSendMessage();
      } else if (isGenerating) {
        // ИСПРАВЛЕНО: Позволяем Enter прерывать генерацию
        e.preventDefault();
        internalSendMessage();
      } else {
        // Если генерации нет, но сообщение пустое — просто запрещаем перенос строки
        e.preventDefault(); 
      }
    }
  }

  $effect(() => {
    // Следим за состоянием для прокрутки
    const len = history.length;
    const lastMessage = len > 0 ? history[len - 1] : null;
    const lastMessageText = lastMessage?.text || '';
    const lastMessageReasoning = lastMessage?.reasoning || '';
    const generating = isGenerating;

    if (len || generating || lastMessageText || lastMessageReasoning) {
      scrollToBottom();
    }
  });
</script>

<section class="chat-column">
  <div 
    class="messages-container" 
    bind:this={chatContainer} 
    onscroll={handleScroll}
  >
    {#if history.length === 0}
      <div class="welcome-screen">
        <div class="welcome-logo">
          {@html CpuIcon}
        </div>
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
            fullHistory={history} 
            onEdit={(newText) => onEditMessage(group.startIndex, newText)}
            onCopy={() => {
              const fullText = group.messages.map(m => m.text).filter(Boolean).join('\n\n');
              onCopyMessage(fullText);
            }}
            onDelete={() => onDeleteMessage(group.startIndex)}
            onRegenerate={() => onRegenerateMessage()}
            onApproveTool={onApproveTool} 
          />
        {/each} 
      </div>
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


  <div class="input-container">
    {#if pendingAttachments.length > 0}
      <div class="attachments-preview">
        {#each pendingAttachments as attr (attr.id)}
          <div class="preview-item">
            {#if attr.type === 'image'}
              <img src={attr.base64} alt={attr.name} />
            {:else}
              <div class="file-placeholder">
                <span class="ext">{attr.name.split('.').pop()}</span>
              </div>
            {/if}
            <button class="remove-attr-btn" onclick={() => removeAttachment(attr.id)}>
              {@html CloseIcon}
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="input-wrapper">
      <button 
        class="attach-btn" 
        onclick={() => fileInput?.click()}
        title={_i18n && m.chat_attach_files()}
      >
        {@html PlusIcon}
      </button>
      <input 
        type="file" 
        bind:this={fileInput} 
        onchange={handleFileSelection} 
        multiple 
        accept="image/*,.pdf,.txt,.doc,.docx" 
        style="display: none;" 
      />

      <textarea 
        bind:this={inputElement}
        bind:value={message} 
        onkeydown={handleKeydown} 
        oninput={adjustHeight}
        placeholder={_i18n && m.chat_input_placeholder()}
        rows="1"
      ></textarea>
      
      <button 
        onclick={internalSendMessage} 
        class:stop-btn={isGenerating}
        disabled={!isGenerating && !message.trim() && pendingAttachments.length === 0}
        title={_i18n && (isGenerating ? m.chat_stop_generating() : m.chat_send_message())}
      >
        {#if isGenerating}
          {@html StopIcon}
        {:else}
          {@html ArrowUpIcon}
        {/if}
      </button>
    </div>
    <div class="footer-note">{_i18n && m.chat_footer_note()}</div>
  </div>
</section>

<style>
  /* Стили остаются без изменений согласно вашему исходному коду */
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

  .welcome-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    opacity: 0.8;
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

  .input-container { 
    padding: 10px 10% 10px 10%;
    background: linear-gradient(transparent, #fdfdfd 20%);
  }

  .attachments-preview {
    max-width: 1000px;
    margin: 0 auto 10px auto;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .preview-item {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #fff;
    overflow: hidden;
  }

  .preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
  }

  .file-placeholder .ext {
    font-size: 10px;
    font-weight: bold;
    color: #6b7280;
    text-transform: uppercase;
  }

  .remove-attr-btn {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    border: 2px solid #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
  }

  .remove-attr-btn :global(svg) {
    width: 100%;
    height: 100%;
  }

  .input-wrapper {
    max-width: 1000px;
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 10px 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  }
  
  .attach-btn {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 8px 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .attach-btn:hover {
    color: #111827;
  }

  .attach-btn :global(svg) {
    width: 20px;
    height: 20px;
  }

  textarea { 
    flex: 1; 
    max-height: 200px;
    min-height: 40px; 
    border: none;
    padding: 8px;
    resize: none; 
    outline: none; 
    font-family: inherit; 
    font-size: 1rem;
    background: transparent;
    overflow-y: auto;
    box-sizing: border-box;
  }
  
  .input-wrapper button:not(.attach-btn) { 
    width: 36px; height: 36px; background: #2f2f2f; color: white; border: none; border-radius: 12px; cursor: pointer; 
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.1s;
    margin-bottom: 2px; 
  }

  .input-wrapper button :global(svg) {
    width: 20px;
    height: 20px;
  }

  .input-wrapper button:hover:not(:disabled):not(.attach-btn) { transform: scale(1.05); background: #000; }
  .input-wrapper button:disabled { background: #e5e7eb; color: #a1a1aa; cursor: not-allowed; }
  .input-wrapper button.stop-btn { background: #e5e7eb; color: #ef4444;}

  .footer-note { text-align: center; font-size: 0.7rem; color: #9ca3af; margin-top: 8px; }
</style>
