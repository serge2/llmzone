<script lang="ts">
  import { marked } from 'marked';
  import Prism from 'prismjs';
  import { tick } from 'svelte';
  import type { ToolCall, Message } from '$lib/types'; // Добавлен импорт Message
  
  // Темы и языки Prism
  import 'prismjs/themes/prism.css'; 
  import 'prismjs/components/prism-typescript';
  import 'prismjs/components/prism-javascript';
  import 'prismjs/components/prism-python';
  import 'prismjs/components/prism-rust';
  import 'prismjs/components/prism-bash';
  import 'prismjs/components/prism-json';
  import 'prismjs/components/prism-erlang';
  import 'prismjs/components/prism-c';
  import 'prismjs/components/prism-cpp';
  import 'prismjs/components/prism-markdown';


  import copyIconRaw from '$lib/assets/icons/copy.svg?raw';
  import checkIconRaw from '$lib/assets/icons/check.svg?raw';
  import editIconRaw from '$lib/assets/icons/edit.svg?raw';
  import trashIconRaw from '$lib/assets/icons/trash.svg?raw';
  import refreshIconRaw from '$lib/assets/icons/refresh.svg?raw';
  import closeIconRaw from '$lib/assets/icons/close.svg?raw';
  import chevronDownIconRaw from '$lib/assets/icons/chevron-down.svg?raw'; // Предполагается наличие иконки

  // В Svelte 5 самый надежный способ передачи типов в $props — деструктуризация с типами
  let { 
    text = "", 
    role, 
    error, // Добавили проп ошибки
    isLastMessage = false,
    isTyping = false,
    tool_calls,
    fullHistory = [], // Оставили для совместимости, но теперь приоритет у chain
    chain = [], // НОВОЕ: Список связанных сообщений (tool и assistant)
    onEdit,
    onCopy,
    onDelete,
    onRegenerate
  }: {
    text: string, 
    role: string,
    error?: string, // Типизация ошибки
    isLastMessage?: boolean,
    isTyping?: boolean,
    tool_calls?: ToolCall[];
    fullHistory?: Message[];
    chain?: Message[]; // Добавлено для группировки
    onEdit?: (newText: string) => void,
    onCopy?: () => void,
    onDelete?: () => void,
    onRegenerate?: () => void
  } = $props();

  let copied = $state(false);
  let isConfirmingDelete = $state(false);
  let deleteTimer: ReturnType<typeof setTimeout> | undefined;

  // Настройка рендерера
  const renderer = new marked.Renderer();
  
  renderer.code = (token: any) => {
    const codeVal = typeof token === 'string' ? token : (token.text || "");
    const lang = (token.lang || 'text').toUpperCase();
    const langClass = (token.lang || 'text').toLowerCase();
    
    return `
      <div class="code-block-wrapper">
        <div class="code-toolbar">
          <span class="code-lang">${lang}</span>
          <button class="copy-code-btn" type="button" title="Копировать код">
            ${copyIconRaw}
          </button>
        </div>
        <pre class="language-${langClass}"><code>${codeVal}</code></pre>
      </div>
    `;
  };

  marked.setOptions({ renderer, breaks: true });

  // Используем $derived напрямую от деструктурированного text
  let htmlContent = $derived.by(() => {
    try {
      return text ? marked.parse(text) : "";
    } catch (e) {
      console.error("Marked Error:", e);
      return text;
    }
  });

  // Вспомогательная функция для парсинга Markdown в цепочке
  function parseMarkdown(content: string) {
    try {
      return marked.parse(content);
    } catch (e) {
      return content;
    }
  }

  // Функция для поиска результата конкретного вызова
  function getToolResult(callId: string) {
    // Сначала ищем в переданной цепочке, потом в fullHistory
    const inChain = chain.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === callId);
    if (inChain) return inChain;
    return fullHistory.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === callId);
  }

  let proseEl: HTMLDivElement | undefined = $state();

  // Обновленный эффект для подсветки синтаксиса (включая JSON внутри виджетов)
  $effect(() => {
    // Явно подписываемся на изменения текста и цепочки, чтобы эффект срабатывал при стриминге
    const contentToWatch = text + JSON.stringify(tool_calls) + chain.length;
    
    if (proseEl) {
      // Используем tick, чтобы дождаться, когда Svelte обновит DOM после изменения текста
      tick().then(() => {
        if (!proseEl) return;
        
        // Находим контейнер сообщения
        const container = proseEl.closest('.message-content');
        if (!container) return;

        // Ищем все блоки кода
        const codeBlocks = container.querySelectorAll('pre code');
        
        codeBlocks.forEach((block) => {
          // Во время стриминга (isLastMessage) мы должны обновлять подсветку постоянно,
          // так как текст внутри блока кода дополняется новыми символами.
          const isHighlighted = block.classList.contains('prism-highlighted');
          
          if (!isHighlighted || isLastMessage) {
            Prism.highlightElement(block);
            // Добавляем маркер, чтобы не переподсвечивать старые сообщения зря
            block.classList.add('prism-highlighted');
          }
        });
      });
    }
  });

  // Эффект для авто-высоты textarea
  $effect(() => {
    // Эта строка заставляет эффект "слушать" каждое изменение editText
    const trigger = editText; 

    if (isEditing && textareaEl) {
      // Используем requestAnimationFrame или tick, чтобы замер был после рендера текста
      requestAnimationFrame(() => {
        if (!textareaEl) return;
        textareaEl.style.height = 'auto';
        textareaEl.style.height = textareaEl.scrollHeight + 'px';
      });
    }
  });

  function handleProseClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-code-btn') as HTMLButtonElement;
    if (!btn) return;

    const pre = btn.closest('.code-block-wrapper')?.querySelector('pre');
    if (pre) {
      navigator.clipboard.writeText(pre.innerText).then(() => {
        // Меняем иконку на галочку из ассетов
        btn.innerHTML = checkIconRaw;
        btn.classList.add('success');
        
        setTimeout(() => { 
          btn.innerHTML = copyIconRaw; 
          btn.classList.remove('success');
        }, 2000);
      });
    }
  }

  async function handleCopyClick() {
    try {
      // Собираем текст из основного сообщения и всех текстовых ответов в цепочке
      let fullText = text;
      chain.forEach(m => {
        if (m.text) fullText += "\n\n" + m.text;
      });

      await navigator.clipboard.writeText(fullText);
      copied = true;
      // Вызываем внешний onCopy, если он нужен (например, для логов)
      if (onCopy) onCopy(); 
      // Возвращаем иконку через 2 секунды
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  }
  

  let isEditing = $state(false);
  let editText = $state("");
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  // Функция включения режима редактирования
  function startEditing() {
    editText = text; // Копируем текущий текст в буфер
    isEditing = true;
    
    // Автофокус на поле ввода после его появления
    tick().then(() => {
      textareaEl?.focus();
    });
  }

  // Функция сохранения
  function saveEdit() {
    const trimmedText = editText.trim();
    if (trimmedText !== "") {
      console.log("Bubble is sending:", trimmedText); 
      if (onEdit) onEdit(trimmedText);
      isEditing = false;
    }
  }

  // Функция отмена
  function cancelEdit() {
    isEditing = false;
    editText = text;
  }

  // Новая логика удаления
  function askDelete() {
    isConfirmingDelete = true;
    // Авто-отмена через 5 секунд простоя
    clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      isConfirmingDelete = false;
    }, 5000);
  }

  function confirmDelete() {
    clearTimeout(deleteTimer);
    isConfirmingDelete = false;
    if (onDelete) onDelete();
  }

  function cancelDelete() {
    clearTimeout(deleteTimer);
    isConfirmingDelete = false;
  }
</script>

<div class="message-wrapper {role}" class:is-generating={isTyping}>
  <div class="message-content" class:editing-mode={isEditing}>
    <div class="message" class:has-error={!!error}>
      <div class="prose" bind:this={proseEl} onclick={handleProseClick} role="presentation">
        {#if isEditing}
          <textarea
            bind:this={textareaEl}
            bind:value={editText}
            class="edit-textarea"
            oninput={() => {}} onkeydown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
          ></textarea>
        {:else if text}
          {@html htmlContent}
        {:else if role === 'assistant' && (!tool_calls || tool_calls.length === 0) && chain.length === 0}
          <span class="thinking-text">ИИ думает...</span>
        {/if}
      </div>

      {#if tool_calls && tool_calls.length > 0}
        <div class="tool-calls-container">
          {#each tool_calls as call}
            {@const result = getToolResult(call.id)}
            {@const isError = result?.tool_result?.isError}
            <div class="tool-widget">
              <details class="main-details">
                <summary class="tool-summary" class:success={!!result && !isError} class:error={isError}>
                  <span class="icon">🛠</span>
                  <span class="name">Инструмент: <strong>{call.name}</strong></span>
                  <span class="status-icon">{@html chevronDownIconRaw}</span>
                </summary>
                
                <div class="tool-details-content">
                  <details class="sub-details">
                    <summary class="sub-summary">
                      <span>Аргументы</span>
                      <span class="sub-status-icon">{@html chevronDownIconRaw}</span>
                    </summary>
                    <pre class="language-json"><code>{JSON.stringify(call.arguments, null, 2)}</code></pre>
                  </details>

                  <details class="sub-details">
                    <summary class="sub-summary">
                      <span>Ответ</span>
                      <span class="sub-status-icon">{@html chevronDownIconRaw}</span>
                    </summary>
                    {#if result}
                      <pre class="language-json"><code>{result.tool_result?.content || result.text}</code></pre>
                    {:else}
                      <div class="tool-loading">Выполнение запроса...</div>
                    {/if}
                  </details>
                </div>
              </details>
            </div>
          {/each}
        </div>
      {/if}

      {#if chain.length > 0}
        {#each chain as msg}
          {#if msg.role === 'assistant' && msg.text}
            <div class="prose chain-item-text">
              {@html parseMarkdown(msg.text)}
            </div>
          {/if}

          {#if msg.tool_calls && msg.tool_calls.length > 0}
            <div class="tool-calls-container">
              {#each msg.tool_calls as call}
                {@const result = chain.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === call.id)}
                {@const isError = result?.tool_result?.isError}
                <div class="tool-widget">
                  <details class="main-details">
                    <summary class="tool-summary" class:success={!!result && !isError} class:error={isError}>
                      <span class="icon">🛠</span>
                      <span class="name">Инструмент: <strong>{call.name}</strong></span>
                      <span class="status-icon">{@html chevronDownIconRaw}</span>
                    </summary>
                    <div class="tool-details-content">
                      <details class="sub-details">
                        <summary class="sub-summary">
                          <span>Аргументы</span>
                          <span class="sub-status-icon">{@html chevronDownIconRaw}</span>
                        </summary>
                        <pre class="language-json"><code>{JSON.stringify(call.arguments, null, 2)}</code></pre>
                      </details>

                      <details class="sub-details">
                        <summary class="sub-summary">
                          <span>Ответ</span>
                          <span class="sub-status-icon">{@html chevronDownIconRaw}</span>
                        </summary>
                        {#if result}
                          <pre class="language-json"><code>{result.tool_result?.content || result.text}</code></pre>
                        {:else}
                          <div class="tool-loading">Выполнение запроса...</div>
                        {/if}
                      </details>
                    </div>
                  </details>
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      {/if}

      {#if error}
        <div class="error-banner">
          <div class="error-header">
            <span class="error-icon">⚠️</span>
            <strong>Ошибка взаимодействия</strong>
          </div>
          <div class="error-text">{error}</div>
        </div>
      {/if}
    </div>
    
    <div 
      class="message-actions" 
      class:hidden={isTyping} 
      class:force-visible={isEditing || isConfirmingDelete}
    >
      {#if isEditing}
        <button class="action-btn success" title="Сохранить" onclick={saveEdit}>
          {@html checkIconRaw}
        </button>
        <button class="action-btn delete-btn" title="Отменить" onclick={cancelEdit}>
          {@html closeIconRaw}
        </button>
      {:else if isConfirmingDelete}
        <span class="confirm-text">Удалить?</span>
        <button class="action-btn danger" title="Да, удалить" onclick={confirmDelete}>
          {@html checkIconRaw}
        </button>
        <button class="action-btn" title="Отмена" onclick={cancelDelete}>
          {@html closeIconRaw}
        </button>
      {:else}

        {#if role === 'assistant' && isLastMessage}
          <button class="action-btn" title="Перегенерировать" onclick={onRegenerate}>
            {@html refreshIconRaw}
          </button>
        {/if}

        {#if role === 'user'}
          <button class="action-btn" title="Редактировать" onclick={startEditing}>
            {@html editIconRaw}
          </button>
        {/if}

        <button 
          class="action-btn" 
          class:success={copied} 
          onclick={handleCopyClick}
          title="Копировать всё сообщение"
        >
          {#if copied}
            {@html checkIconRaw}
          {:else}
            {@html copyIconRaw}
          {/if}
        </button>

        <button 
          class="action-btn delete-btn" 
          onclick={askDelete}
          title="Удалить сообщение"
        >
          {@html trashIconRaw}
        </button>

      {/if}
    </div>

    {#if isTyping && (text || chain.length > 0)}
      <div class="status-note">ИИ работает...</div>
    {/if}
  </div>
</div>


<style>
  .message-wrapper { display: flex; width: 100%; margin-bottom: 16px; animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

  .message-wrapper.user { justify-content: flex-end; }
  .message-content { display: flex; flex-direction: column; gap: 6px; max-width: 90%; }
  
  .message { padding: 14px 18px; border-radius: 16px; line-height: 1.55; font-size: 0.95rem; }

  .user .message { background: #e3f2fd; color: #0d47a1; border-bottom-right-radius: 4px; }
  .assistant .message { background: #ffffff; color: #263238; border: 1px solid #eceff1; border-bottom-left-radius: 4px; }
  
  /* Стиль при наличии ошибки */
  .assistant .message.has-error {
    border-color: #fecaca;
    background: #fffcfc;
  }

  /* Когда редактируем, расширяем контейнер до 100% */
  .message-content.editing-mode {
    max-width: 100%;
    width: 100%;
  }

  /* В режиме редактирования убираем ограничение ширины и меняем стиль пузырька */
  .editing-mode .message {
    width: 100%;
    background: #ffffff !important; /* Белый фон для фокуса на тексте */
    border: 1px solid #5865f2 !important; /* Акцентная рамка */
    box-shadow: 0 4px 12px rgba(88, 101, 242, 0.15);
    color: #1a1a1b !important;
  }

  .prose :global(p) { margin: 0 0 1em 0; }
  .prose :global(p:last-child) { margin-bottom: 0; }

  .prose :global(.code-block-wrapper) {
    margin: 12px 0;
    border-radius: 10px;
    border: 1px solid rgba(0,0,0,0.08);
    overflow: hidden;
    background: #f8f9fa;
  }

  .prose :global(.code-toolbar) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 14px;
    background: rgba(0,0,0,0.03);
    font-size: 11px;
    font-weight: 600;
    color: #546e7a;
  }

  .prose :global(pre) { margin: 0 !important; padding: 16px !important; background: transparent !important; overflow-x: auto; }
  
  .prose :global(.copy-code-btn) {
    background: #fff;
    border: 1px solid rgba(0,0,0,0.1);
    padding: 4px;
    border-radius: 5px;
    cursor: pointer;
    color: #888;
    display: flex;
  }

  .message-actions { 
    display: flex; 
    gap: 10px; 
    opacity: 0; 
    transition: opacity 0.2s; 
    margin-top: 4px; 
    padding: 0 6px;
    pointer-events: none; /* Отключаем клики, когда панель невидима */
  }
  .message-actions.hidden { display: none !important; }
  
  /* Показываем при наведении на сообщение */
  .message-wrapper:hover:not(.is-generating) .message-actions { 
    opacity: 1; 
    pointer-events: auto;
  }

  /* ПРИНУДИТЕЛЬНАЯ ВИДИМОСТЬ: Показываем всегда, если редактируем или подтверждаем удаление */
  .message-actions.force-visible {
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  .action-btn {transition: all 0.2s ease; background: none; border: none; cursor: pointer; color: #b0bec5; }
  
  /* Стили для кнопки удаления */
  .action-btn.delete-btn.confirming {
    color: #ef4444 !important; /* Красный цвет для подтверждения */
    transform: scale(1.1);
  }
  
  /* Добавляем поддержку цвета успеха для всех кнопок копирования */
  .action-btn.success,
  .prose :global(.copy-code-btn.success) {
    color: #10b981 !important;
  }

  /* Класс для подтверждения деструктивных действий (удаление) */
  .action-btn.danger {
    color: #ef4444 !important;
  }
  
  /* Для плавности иконок внутри пропса ?raw */
  .prose :global(.copy-code-btn svg) {
    display: block;
    width: 14px;
    height: 14px;
  }

  .action-btn :global(svg) { 
    width: 14px;
    height: 14px;
    display: block; /* Гарантирует правильное центрирование */
  }

  /* Стили для цитат */
  .prose :global(blockquote) {
    margin: 16px 0;
    padding: 8px 16px;
    border-left: 4px solid #e5e7eb; /* Акцентная линия слева */
    background-color: #f9fafb;     /* Легкий фон */
    color: #4b5563;                /* Чуть более приглушенный цвет текста */
    font-style: italic;
    border-radius: 4px;
  }

  /* Стили для списков */
  .prose :global(ul), 
  .prose :global(ol) {
    margin: 12px 0;
    padding-left: 24px; /* Отступ для маркеров */
    display: flex;
    flex-direction: column;
    gap: 6px; /* Расстояние между пунктами списка */
  }

  /* Стили для элементов списка */
  .prose :global(li) {
    line-height: 1.5;
  }

  /* Если внутри списка есть еще один список, выделим его */
  .prose :global(li > ul),
  .prose :global(li > ol) {
    margin: 8px 0 8px 12px;
    padding: 8px 12px;
  }

  .edit-textarea {
    width: 100%;
    display: block;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.55; /* Должно совпадать с .message */
    resize: none;
    outline: none;
    color: inherit;
    overflow: hidden;
    box-sizing: border-box; /* Важно для точного расчета высоты */
    min-height: 1.55em;    /* Высота одной строки */
    white-space: pre-wrap; /* Улучшаем читаемость при редактировании длинных текстов */
    word-break: break-word;
  }

  .user .edit-textarea {
    border-color: rgba(13, 71, 161, 0.2);
  }

  .confirm-text {
    font-size: 0.75rem;
    color: #ef4444;
    font-weight: 600;
    margin-right: 4px;
    align-self: center;
    user-select: none;
  }

  /* Подсвечиваем кнопку подтверждения (галочку) красным в режиме удаления, 
     чтобы акцентировать внимание на деструктивном действии */
  .isConfirmingDelete .action-btn.success {
    color: #ef4444 !important;
  }

  .status-note {
    font-size: 0.7rem;
    color: #94a3b8;
    margin-top: 2px;
    padding-left: 6px;
    animation: blink 1.5s infinite;
  }

  .thinking-text {
    color: #94a3b8;
    font-style: italic;
    font-size: 0.9rem;
    animation: pulse-opacity 1.5s infinite ease-in-out;
  }

/* Ограничиваем влияние только на таблицы внутри .prose */
  .prose :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    /* Гарантируем, что таблица не вылезет за пределы пузырька */
    display: block;
    overflow-x: auto;
  }

  /* Стили для ячеек заголовка */
  .prose :global(th) {
    background-color: #f8fafc;
    padding: 12px 16px;
    font-weight: 600;
    text-align: left;
    border-bottom: 2px solid #e2e8f0;
    color: #475569;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  /* Стили для обычных ячеек */
  .prose :global(td) {
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: #1e293b;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  /* Убираем нижнюю границу у последней строки, чтобы не дублировать рамку таблицы */
  .prose :global(tr:last-child td) {
    border-bottom: none;
  }

  /* Подсветка четных строк для читаемости (зебра) */
  .prose :global(tr:nth-child(even)) {
    background-color: #fbfcfe;
  }

  /* Эффект наведения на строку */
  .prose :global(tr:hover) {
    background-color: #f1f5f9;
  }

  /* Стили для инструментов MCP */
  .tool-calls-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    width: 100%;
  }

  .tool-widget {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc; /* Светлый фон заголовка */
    overflow: hidden;
  }

  .tool-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    list-style: none;
    font-size: 0.85rem;
    color: #475569;
    user-select: none;
    transition: background-color 0.2s, color 0.2s;
  }

  /* Состояния успеха и ошибки для шапки виджета */
  .tool-summary.success {
    background-color: #f0fdf4;
    color: #166534;
    border-bottom: 1px solid #dcfce7;
  }

  .tool-summary.error {
    background-color: #fef2f2;
    color: #991b1b;
    border-bottom: 1px solid #fee2e2;
  }
  
  .tool-summary::-webkit-details-marker { display: none; }

  .tool-summary .status-icon {
    margin-left: auto;
    width: 14px;
    height: 14px;
    transition: transform 0.2s;
    color: currentColor;
    opacity: 0.5;
    display: flex;
    align-items: center;
  }

  .main-details[open] .status-icon {
    transform: rotate(180deg);
  }

  .tool-details-content {
    padding: 0 10px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #f1f5f9;
    background: #ffffff; /* Белый фон внутри контента */
  }

  /* Стили для текстовых ответов в цепочке (замена инлайновых стилей) */
  .chain-item-text {
    margin-top: 12px;
    border-top: 1px solid #f1f5f9;
    padding-top: 12px;
  }

  .sub-details {
    border: 1px solid #f1f5f9;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  }

  .sub-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    background: #fcfdfe;
    list-style: none;
  }
  .sub-summary::-webkit-details-marker { display: none; }

  .sub-status-icon {
    width: 12px;
    height: 12px;
    transition: transform 0.2s;
    color: #cbd5e1;
    display: flex;
    align-items: center;
  }

  .sub-details[open] .sub-status-icon {
    transform: rotate(180deg);
  }

  /* Светлая тема для JSON-контента */
  .tool-details-content :global(pre) {
    margin: 0 !important;
    padding: 12px !important;
    font-size: 0.8rem !important;
    background: #fafafa !important;
    color: #334155 !important;
    border-radius: 0;
    max-height: 400px;
    overflow-y: auto;
    border-top: 1px solid #f1f5f9;
  }

  .tool-loading {
    padding: 10px;
    font-size: 0.75rem;
    color: #94a3b8;
    font-style: italic;
    text-align: center;
  }

  .tool-summary :global(svg), .sub-summary :global(svg) { 
    width: 100%; 
    height: 100%; 
  }

  /* Стили для баннера ошибки */
  .error-banner {
    margin-top: 12px;
    padding: 12px;
    border-radius: 10px;
    background: #fff5f5;
    border: 1px solid #feb2b2;
    color: #c53030;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    margin-bottom: 4px;
  }

  .error-icon {
    font-size: 1rem;
  }

  .error-text {
    font-size: 0.8rem;
    line-height: 1.4;
    opacity: 0.9;
    word-break: break-word;
  }

  @keyframes pulse-opacity {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }

  @keyframes blink {
    0% { opacity: 0.2; }
    50% { opacity: 1; }
    100% { opacity: 0.2; }
  }
</style>
