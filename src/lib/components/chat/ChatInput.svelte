<!-- src/lib/components/chat/ChatInput.svelte -->
<script lang="ts">
  import type { Attachment } from '$lib/types';
  import * as m from '$paraglide/messages';
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition'; // Добавлено для плавности

  // Импорт иконок
  import ArrowUpIcon from '$lib/assets/icons/arrow-up.svg?raw';
  import StopIcon from '$lib/assets/icons/stop.svg?raw';
  import PlusIcon from '$lib/assets/icons/plus.svg?raw'; 
  import CloseIcon from '$lib/assets/icons/close.svg?raw';

  let { 
    currentLocale,
    isGenerating,
    message = $bindable(),
    usage = null, // НОВОЕ: Данные об использовании токенов из последнего ответа
    onSendMessage
  }: {
    currentLocale: string,
    isGenerating: boolean,
    message: string,
    usage: any | null,
    onSendMessage: (attachments?: Attachment[]) => void
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  // --- ЛОГИКА ВЛОЖЕНИЙ ---
  let pendingAttachments = $state<Attachment[]>([]);
  let fileInput = $state<HTMLInputElement>();
  let inputElement = $state<HTMLTextAreaElement>();

  async function handleFileSelection(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
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
    if (fileInput) fileInput.value = ''; 
  }

  function removeAttachment(id: string) {
    pendingAttachments = pendingAttachments.filter(a => a.id !== id);
  }

  function internalSendMessage() {
    if (isGenerating) {
      onSendMessage([]);
    } else if (message.trim() || pendingAttachments.length > 0) {
      onSendMessage([...pendingAttachments]);
      pendingAttachments = []; 
    }
  }

  function adjustHeight() {
    if (inputElement) {
      inputElement.style.height = 'auto';
      inputElement.style.height = `${inputElement.scrollHeight}px`;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isGenerating && (message.trim() || pendingAttachments.length > 0)) {
        e.preventDefault();
        internalSendMessage();
      } else if (isGenerating) {
        e.preventDefault();
        internalSendMessage();
      } else {
        e.preventDefault(); 
      }
    }
  }

  // Следим за сообщением, чтобы сбрасывать высоту после отправки
  $effect(() => {
    if (message === '') {
      adjustHeight();
    }
  });

  // Экспортируем метод фокуса для родителя через Snippet или привязку
  export function focus() {
    inputElement?.focus();
    adjustHeight();
  }
</script>

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

  {#if usage && usage.total_tokens}
    <div class="usage-stats" transition:fade={{ duration: 200 }}>
      <span class="tokens-pill">
        <span class="token-count"><b>{usage.total_tokens}</b> tokens</span>
        {#if usage.prompt_tokens}
          <span class="tokens-details">({usage.prompt_tokens} in / {usage.completion_tokens} out)</span>
        {/if}
      </span>
    </div>
  {/if}

  <div class="footer-note">{_i18n && m.chat_footer_note()}</div>
</div>

<style>
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

  /* Стили для счетчика токенов */
  .usage-stats {
    display: flex;
    justify-content: center;
    margin-top: 8px;
    margin-bottom: -4px;
  }

  .tokens-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #f3f4f6;
    padding: 2px 10px;
    border-radius: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.65rem;
    color: #6b7280;
    border: 1px solid #e5e7eb;
  }

  .token-count b {
    color: #374151;
  }

  .tokens-details {
    color: #9ca3af;
  }

  .footer-note { text-align: center; font-size: 0.7rem; color: #9ca3af; margin-top: 8px; }
</style>
