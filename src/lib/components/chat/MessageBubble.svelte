<script lang="ts">
  import { marked } from 'marked';
  import Prism from 'prismjs';
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { ToolCall, Message, Attachment } from '$lib/types';
  
  // Импорт новых подкомпонентов
  import ToolWidget from './ToolWidget.svelte';
  import ReasoningBlock from './ReasoningBlock.svelte';

  // Импорт локализации
  import * as m from '$paraglide/messages';

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
  import chevronDownIconRaw from '$lib/assets/icons/chevron-down.svg?raw';

  // В Svelte 5 самый надежный способ передачи типов в $props — деструктуризация с типами
  let { 
    role, 
    currentLocale, // Принимаем реактивную руну для i18n
    error, // Добавили проп ошибки
    isLastMessage = false,
    isTyping = false,
    fullHistory = [], 
    messages = [], // Теперь принимаем всю группу целиком
    onEdit,
    onCopy,
    onDelete,
    onRegenerate,
    onApproveTool // Обработчик подтверждения инструмента
  }: {
    role: 'user' | 'assistant' | 'tool' | 'system',
    currentLocale: string,
    error?: string, // Типизация ошибки
    isLastMessage?: boolean,
    isTyping?: boolean,
    fullHistory?: Message[],
    messages?: Message[], // Список связанных сообщений в группе
    onEdit?: (newText: string) => void,
    onCopy?: () => void,
    onDelete?: () => void,
    onRegenerate?: () => void,
    onApproveTool?: (callId: string, status: 'approved' | 'rejected') => void // Типизация
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

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
          <button class="copy-code-btn" type="button" title="${_i18n && m.bubble_copy_code()}">
            ${copyIconRaw}
          </button>
        </div>
        <pre class="language-${langClass}"><code>${codeVal}</code></pre>
      </div>
    `;
  };

  marked.setOptions({ renderer, breaks: true });

  // Вспомогательная функция для парсинга Markdown
  function parseMarkdown(content: string) {
    try {
      return content ? marked.parse(content) : "";
    } catch (e) {
      console.error("Marked Error:", e);
      return content;
    }
  }

  // Функция для поиска результата конкретного вызова
  function getToolResult(callId: string) {
    // Ищем в текущей группе сообщений
    const inChain = messages.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === callId);
    if (inChain) return inChain;
    return fullHistory.find(m => m.role === 'tool' && m.tool_result?.tool_call_id === callId);
  }

  let proseEl: HTMLDivElement | undefined = $state();

  // Обновленный эффект для подсветки синтаксиса
  $effect(() => {
    // Подписываемся на изменения всей группы сообщений
    const contentToWatch = JSON.stringify(messages) + isTyping;
    
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
      // Собираем текст из всех сообщений в группе
      let fullText = "";
      messages.forEach(m => {
        if (m.text) fullText += (fullText ? "\n\n" : "") + m.text;
      });

      await navigator.clipboard.writeText(fullText);
      copied = true;
      if (onCopy) onCopy(); 
      setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Ошибка копирования:', err);
    }
  }
  

  let isEditing = $state(false);
  let editText = $state(""); // Изначально пустая строка
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  
  // Состояния для размышлений внутри группы
  let reasoningExpanded = $state<Record<number, boolean>>({});

  // Состояние для раскрытых инструментов (callId -> boolean)
  let expandedTools = $state<Record<string, boolean>>({});

  // синхронизируем editText с текстом первого сообщения (обычно User)
  $effect(() => {
    if (!isEditing && messages[0]) {
      editText = messages[0].text;
    }
  });

  // Функция включения режима редактирования
  function startEditing() {
    editText = messages[0]?.text || ""; 
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
      if (onEdit) onEdit(trimmedText);
      isEditing = false;
    }
  }

  // Функция отмена
  function cancelEdit() {
    isEditing = false;
    editText = messages[0]?.text || "";
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
            onkeydown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
          ></textarea>
        {:else}
          {#each messages as msg, i}
            {#if msg.reasoning && msg.reasoning.length > 0}
              <ReasoningBlock 
                reasoning={msg.reasoning}
                currentLocale={currentLocale}
                index={i}
                {isTyping}
                isLastInGroup={i === messages.length - 1}
                hasNoText={!msg.text}
                bind:reasoningExpanded
              />
            {/if}

            {#if i === 0 && msg.attachments && msg.attachments.length > 0}
              <div class="message-attachments" class:user-align={role === 'user'}>
                {#each msg.attachments as attr}
                  <div class="attachment-item">
                    {#if attr.type === 'image'}
                      <img src={attr.base64} alt={attr.name} class="attachment-image" />
                    {:else}
                      <div class="attachment-file-card">
                        <span class="file-icon">📄</span>
                        <div class="file-info">
                          <span class="file-name" title={attr.name}>{attr.name}</span>
                          <span class="file-meta">{attr.name.split('.').pop()?.toUpperCase()} • {(attr.size / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            {#if msg.text && msg.role !== 'tool'}
              <div class:chain-item-text={i > 0}>
                {@html parseMarkdown(msg.text)}
              </div>
            {:else if role === 'assistant' && i === messages.length - 1 && (!msg.tool_calls || msg.tool_calls.length === 0) && !msg.reasoning && msg.role !== 'tool'}
               {#if isTyping}
                <span class="thinking-text">{_i18n && m.bubble_ai_thinking()}</span>
              {:else}
                <span class="thinking-text" style="animation: none; opacity: 0.6;">{_i18n && m.bubble_generation_stopped()}</span>
              {/if}
            {/if}

            {#if msg.tool_calls && msg.tool_calls.length > 0}
              <div class="tool-calls-container">
                {#each msg.tool_calls as call}
                  <ToolWidget 
                    {call}
                    result={getToolResult(call.id)}
                    {currentLocale}
                    bind:expandedTools
                    {onApproveTool}
                  />
                {/each}
              </div>
            {/if}
          {/each}
        {/if}
      </div>

      {#if error}
        <div class="error-banner">
          <div class="error-header">
            <span class="error-icon">⚠️</span>
            <strong>{_i18n && m.bubble_error_title()}</strong>
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
        <button class="action-btn success" title={_i18n && m.sidebar_tooltip_save()} onclick={saveEdit}>
          {@html checkIconRaw}
        </button>
        <button class="action-btn delete-btn" title={_i18n && m.sidebar_tooltip_cancel()} onclick={cancelEdit}>
          {@html closeIconRaw}
        </button>
      {:else if isConfirmingDelete}
        <span class="confirm-text">{_i18n && m.sidebar_delete_confirm()}</span>
        <button class="action-btn danger" title={_i18n && m.bubble_action_confirm_delete()} onclick={confirmDelete}>
          {@html checkIconRaw}
        </button>
        <button class="action-btn" title={_i18n && m.sidebar_tooltip_cancel()} onclick={cancelDelete}>
          {@html closeIconRaw}
        </button>
      {:else}

        {#if role === 'assistant' && isLastMessage}
          <button class="action-btn" title={_i18n && m.bubble_action_regenerate()} onclick={onRegenerate}>
            {@html refreshIconRaw}
          </button>
        {/if}

        {#if role === 'user'}
          <button class="action-btn" title={_i18n && m.sidebar_menu_rename()} onclick={startEditing}>
            {@html editIconRaw}
          </button>
        {/if}

        <button 
          class="action-btn" 
          class:success={copied} 
          onclick={handleCopyClick}
          title={_i18n && m.bubble_action_copy()}
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
          title={_i18n && m.sidebar_menu_delete()}
        >
          {@html trashIconRaw}
        </button>

      {/if}
    </div>

    {#if isTyping && messages.some(m => m.text || (m.tool_calls && m.tool_calls.length > 0))}
      <div class="status-note">{_i18n && m.bubble_ai_working()}</div>
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
  
  .assistant .message.has-error {
    border-color: #fecaca;
    background: #fffcfc;
  }

  .message-content.editing-mode {
    max-width: 100%;
    width: 100%;
  }

  .editing-mode .message {
    width: 100%;
    background: #ffffff !important;
    border: 1px solid #5865f2 !important;
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
    pointer-events: none;
  }
  .message-actions.hidden { display: none !important; }
  
  .message-wrapper:hover:not(.is-generating) .message-actions { 
    opacity: 1; 
    pointer-events: auto;
  }

  .message-actions.force-visible {
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  .action-btn {transition: all 0.2s ease; background: none; border: none; cursor: pointer; color: #b0bec5; }
  
  .action-btn.success,
  .prose :global(.copy-code-btn.success) {
    color: #10b981 !important;
  }

  .action-btn.danger {
    color: #ef4444 !important;
  }
  
  .prose :global(.copy-code-btn svg) {
    display: block;
    width: 14px;
    height: 14px;
  }

  .action-btn :global(svg) { 
    width: 14px;
    height: 14px;
    display: block;
  }

  .prose :global(blockquote) {
    margin: 16px 0;
    padding: 8px 16px;
    border-left: 4px solid #e5e7eb;
    background-color: #f9fafb;
    color: #4b5563;
    font-style: italic;
    border-radius: 4px;
  }

  .prose :global(ul), 
  .prose :global(ol) {
    margin: 12px 0;
    padding-left: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .prose :global(li) {
    line-height: 1.5;
  }

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
    line-height: 1.55;
    resize: none;
    outline: none;
    color: inherit;
    overflow: hidden;
    box-sizing: border-box;
    min-height: 1.55em;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .confirm-text {
    font-size: 0.75rem;
    color: #ef4444;
    font-weight: 600;
    margin-right: 4px;
    align-self: center;
    user-select: none;
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

  .prose :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
    background-color: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    display: block;
    overflow-x: auto;
  }

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

  .prose :global(td) {
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: #1e293b;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .prose :global(tr:last-child td) {
    border-bottom: none;
  }

  .prose :global(tr:nth-child(even)) {
    background-color: #fbfcfe;
  }

  .prose :global(tr:hover) {
    background-color: #f1f5f9;
  }

  .tool-calls-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
    width: 100%;
  }

  .chain-item-text {
    margin-top: 12px;
    border-top: 1px solid #f1f5f9;
    padding-top: 12px;
  }

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

  .message-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;
  }
  
  .user-align {
    justify-content: flex-end;
  }

  .attachment-item {
    max-width: 100%;
  }

  .attachment-image {
    max-width: 320px;
    max-height: 320px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    object-fit: contain;
    background-color: #f8fafc;
  }

  .attachment-file-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #f1f5f9;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    min-width: 200px;
    max-width: 300px;
  }

  .user .attachment-file-card {
    background: rgba(255, 255, 255, 0.5);
    border-color: rgba(13, 71, 161, 0.1);
  }

  .file-icon {
    font-size: 1.5rem;
  }

  .file-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .file-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #334155;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    font-size: 0.7rem;
    color: #64748b;
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
