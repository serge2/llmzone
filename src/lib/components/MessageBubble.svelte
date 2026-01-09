<script lang="ts">
  import { marked } from 'marked';
  import Prism from 'prismjs';
  import { tick } from 'svelte';
  
  // Темы и языки Prism
  import 'prismjs/themes/prism.css'; 
  import 'prismjs/components/prism-typescript';
  import 'prismjs/components/prism-javascript';
  import 'prismjs/components/prism-python';
  import 'prismjs/components/prism-rust';
  import 'prismjs/components/prism-bash';
  import 'prismjs/components/prism-json';

  // В Svelte 5 самый надежный способ передачи типов в $props — деструктуризация с типами
  let { 
    text = "", 
    role, 
    isLastMessage = false,
    onEdit,
    onCopy,
    onDelete,
    onRegenerate
  }: {
    text: string, 
    role: string,
    isLastMessage?: boolean,
    onEdit?: () => void,
    onCopy?: () => void,
    onDelete?: () => void,
    onRegenerate?: () => void
  } = $props();

  $effect(() => {
    console.log("DEBUG: MessageBubble получил текст:", text);
    console.log("DEBUG: Длина текста:", text?.length);
  });

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
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
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

  let proseEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (htmlContent && proseEl) {
      tick().then(() => {
        if (!proseEl) return;
        proseEl.querySelectorAll('pre code').forEach((block) => {
          if (!block.classList.contains('prism-highlighted') || isLastMessage) {
            Prism.highlightElement(block);
            block.classList.add('prism-highlighted');
          }
        });
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
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<span style="font-size: 10px; color: #28a745">Copied!</span>';
        setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
      });
    }
  }
</script>

<div class="message-wrapper {role}">
  <div class="message-content">
    <div class="message">
      <div class="prose" bind:this={proseEl} onclick={handleProseClick} role="presentation">
        {#if text}
          {@html htmlContent}
        {:else if role === 'ai'}
          <span class="loading-dots">...</span>
        {/if}
      </div>
    </div>
    
    <div class="message-actions">
      {#if role === 'user'}
        <button class="action-btn" title="Редактировать" onclick={onEdit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
      {/if}
      <button class="action-btn" title="Копировать" onclick={onCopy}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <button class="action-btn" title="Удалить" onclick={onDelete}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
      {#if role === 'ai' && isLastMessage}
        <button class="action-btn" title="Перегенерировать" onclick={onRegenerate}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2-8.83"></path></svg>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .message-wrapper { display: flex; width: 100%; margin-bottom: 16px; animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

  .message-wrapper.user { justify-content: flex-end; }
  .message-content { display: flex; flex-direction: column; gap: 6px; max-width: 80%; }
  
  .message { padding: 14px 18px; border-radius: 16px; line-height: 1.55; font-size: 0.95rem; }

  .user .message { background: #e3f2fd; color: #0d47a1; border-bottom-right-radius: 4px; }
  .ai .message { background: #ffffff; color: #263238; border: 1px solid #eceff1; border-bottom-left-radius: 4px; }

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

  .message-actions { display: flex; gap: 10px; opacity: 0; transition: opacity 0.2s; margin-top: 4px; padding: 0 6px; }
  .message-wrapper:hover .message-actions { opacity: 1; }
  .action-btn { background: none; border: none; cursor: pointer; color: #b0bec5; }
  .action-btn svg { width: 14px; height: 14px; }

  .loading-dots { color: #ccc; animation: blink 1.5s infinite; }
  @keyframes blink { 0% { opacity: 0.2; } 50% { opacity: 1; } 100% { opacity: 0.2; } }
</style>