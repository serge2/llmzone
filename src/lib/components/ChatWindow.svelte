<script lang="ts">
  import type { Message } from '$lib/types';
  import MessageBubble from './MessageBubble.svelte';
  import { tick, onMount } from 'svelte';

  // Импорт иконок из ассетов
  import ArrowUpIcon from '$lib/assets/icons/arrow-up.svg?raw';
  import StopIcon from '$lib/assets/icons/stop.svg?raw';
  import ChevronDownIcon from '$lib/assets/icons/chevron-down.svg?raw';

  let { 
    history, 
    isGenerating, 
    message = $bindable(), 
    onSendMessage,
    onEditMessage,
    onCopyMessage,
    onDeleteMessage,
    onRegenerateMessage
  } = $props<{
    history: Message[];
    isGenerating: boolean;
    message: string;
    onSendMessage: () => void;
    onEditMessage: (index: number, newText: string) => void;
    onCopyMessage: (text: string) => void;
    onDeleteMessage: (index: number) => void;
    onRegenerateMessage: () => void;
  }>();

  // НОВОЕ: Группировка сообщений для отображения в виде единых блоков
  let displayGroups = $derived.by(() => {
    const groups: { main: Message; chain: Message[]; startIndex: number }[] = [];
    
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      
      if (msg.role === 'user') {
        // Сообщение пользователя всегда начинает новую группу
        groups.push({ main: msg, chain: [], startIndex: i });
      } else if (msg.role === 'assistant') {
        const lastGroup = groups[groups.length - 1];
        // Если предыдущая группа уже была от ассистента, значит это продолжение (после инструментов)
        if (lastGroup && lastGroup.main.role === 'assistant') {
          lastGroup.chain.push(msg);
        } else {
          // Иначе это первый ответ ассистента в этой итерации
          groups.push({ main: msg, chain: [], startIndex: i });
        }
      } else if (msg.role === 'tool') {
        // Инструменты всегда прикрепляем к последней группе ассистента
        const lastGroup = groups[groups.length - 1];
        if (lastGroup) {
          lastGroup.chain.push(msg);
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
    // 3. Сообщение НЕ пустое (trim убирает пробелы и переносы)
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isGenerating && message.trim()) {
        e.preventDefault();
        onSendMessage();
      } else if (!isGenerating) {
        // Если генерации нет, но сообщение пустое — просто запрещаем перенос строки
        e.preventDefault(); 
      }
    }
  }

  $effect(() => {
    // 1. Следим за количеством сообщений
    const len = history.length;
    
    // 2. Следим за текстом последнего сообщения (самое важное для стриминга!)
    const lastMessageText = len > 0 ? history[len - 1].text : '';
    
    // 3. Следим за состоянием генерации
    const generating = isGenerating;

    // Если хоть что-то из этого изменилось — пробуем скроллить
    if (len || generating || lastMessageText) {
      // Используем untrack, если не хотим, чтобы scrollToBottom 
      // создавал лишние зависимости (хотя здесь это не критично)
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
    <div class="messages-list">
      {#each displayGroups as group (group.startIndex)}
        <MessageBubble 
          text={group.main.text} 
          role={group.main.role}
          tool_calls={group.main.tool_calls} 
          chain={group.chain}
          isLastMessage={(group.startIndex + group.chain.length) >= history.length - 1}
          isTyping={isGenerating && (group.startIndex + group.chain.length) >= history.length - 1}
          fullHistory={history} 
          onEdit={(newText) => onEditMessage(group.startIndex, newText)}
          onCopy={() => onCopyMessage(group.main.text)}
          onDelete={() => onDeleteMessage(group.startIndex)}
          onRegenerate={() => onRegenerateMessage()}
        />
      {/each} 
    </div>

    {#if showScrollButton}
      <button 
        class="scroll-down-btn" 
        onclick={() => scrollToBottom(true)}
        aria-label="Scroll to bottom"
      >
        {@html ChevronDownIcon}
      </button>
    {/if}
  </div>

  <div class="input-container">
    <div class="input-wrapper">
      <textarea 
        bind:this={inputElement}
        bind:value={message} 
        onkeydown={handleKeydown} 
        oninput={adjustHeight}
        placeholder="Спросите о чем угодно..."
        rows="1"
      ></textarea>
      
      <button 
        onclick={onSendMessage} 
        class:stop-btn={isGenerating}
        disabled={!isGenerating && !message.trim()}
      >
        {#if isGenerating}
          {@html StopIcon}
        {:else}
          {@html ArrowUpIcon}
        {/if}
      </button>
    </div>
    <div class="footer-note">AI может ошибаться. Проверяйте важную информацию.</div>
  </div>
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
    padding: 0 5%; /* Отступы для центрирования контента как в ChatGPT */
    position: relative;
  }

  .messages-list {
    max-width: 1000px;
    margin: 0 auto;
    padding: 20px 0;
    display: flex;
    flex-direction: column;
  }

  /* Кнопка прокрутки вниз */
  .scroll-down-btn {
    position: sticky;
    /* Сдвигаем кнопку максимально вправо */
    left: 100%;
    bottom: 20px;
    
    /* Убираем или уменьшаем translateX. 
       Если поставить 0, она будет прижата к правому краю контейнера.
       Если поставить, например, 20px, она выйдет за его пределы. */
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
  
  textarea { 
    flex: 1; 
    max-height: 200px;
    min-height: 40px; /* Установили комфортную начальную высоту */
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
  
  .input-wrapper button { 
    width: 36px; height: 36px; background: #2f2f2f; color: white; border: none; border-radius: 12px; cursor: pointer; 
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.1s;
    margin-bottom: 2px; /* Чуть приподнимаем кнопку, чтобы она была по центру первой строки */
  }

  /* Стилизация иконок через @html */
  .input-wrapper button :global(svg) {
    width: 20px;
    height: 20px;
  }

  .input-wrapper button:hover:not(:disabled) { transform: scale(1.05); background: #000; }
  .input-wrapper button:disabled { background: #e5e7eb; color: #a1a1aa; cursor: not-allowed; }
  .input-wrapper button.stop-btn { background: #e5e7eb; color: #ef4444;}

  .footer-note { text-align: center; font-size: 0.7rem; color: #9ca3af; margin-top: 8px; }

  @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
</style>
