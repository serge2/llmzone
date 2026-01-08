<script lang="ts">
  import { marked } from 'marked';
  import Prism from 'prismjs';
  
  // Подключаем светлую тему Prism
  import 'prismjs/themes/prism.css'; 
  
  // Языки
  import 'prismjs/components/prism-typescript';
  import 'prismjs/components/prism-javascript';
  import 'prismjs/components/prism-python';
  import 'prismjs/components/prism-rust';
  import 'prismjs/components/prism-bash';
  import 'prismjs/components/prism-json';
  import 'prismjs/components/prism-erlang';
  import 'prismjs/components/prism-c';
  import 'prismjs/components/prism-cpp';

  
  let { 
    text, 
    role, 
    isLastMessage = false,
    onEdit,
    onCopy,
    onDelete,
    onRegenerate
  } = $props<{ 
    text: string, 
    role: string,
    isLastMessage?: boolean,
    onEdit?: () => void,
    onCopy?: () => void,
    onDelete?: () => void,
    onRegenerate?: () => void
  }>();
  let htmlContent = $derived(marked.parse(text || ''));
  let proseEl: HTMLDivElement;

  function getLanguageName(className: string) {
    const match = className.match(/language-(\w+)/);
    return match ? match[1].toUpperCase() : 'CODE';
  }

  function handleCopyClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest('.copy-btn');
    if (!btn) return;
    const pre = btn.closest('.code-block')?.querySelector('pre');
    if (!pre) return;
    const code = pre.innerText || pre.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      btn.classList.add('copied');
      const svg = btn.querySelector('svg') as SVGElement;
      if (svg) {
        svg.style.width = '16px';
        svg.style.height = '16px';
        svg.style.color = '#16a34a';
        svg.style.flexShrink = '0';
      }
      setTimeout(() => { 
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
        const svg = btn.querySelector('svg') as SVGElement;
        if (svg) {
          svg.style.width = '16px';
          svg.style.height = '16px';
          svg.style.color = '#666';
          svg.style.flexShrink = '0';
        }
        btn.classList.remove('copied'); 
      }, 1500);
    }).catch(() => {
      const range = document.createRange();
      const codeEl = pre.querySelector('code');
      if (codeEl) {
        range.selectNodeContents(codeEl);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    });
  }

  $effect(() => {
    if (htmlContent && proseEl) {
      // Таймаут нужен, чтобы Svelte успел отрендерить HTML в DOM и CSS загрузился
      setTimeout(() => {
        // Сначала применяем стили выравнивания для wrapper
        const wrapper = proseEl.closest('.message-wrapper');
        if (wrapper) {
          if (role === 'user') {
            wrapper.setAttribute('style', 'display: flex !important; width: 100% !important; justify-content: flex-end !important;');
          } else {
            wrapper.setAttribute('style', 'display: flex !important; width: 100% !important; justify-content: flex-start !important;');
          }
        }
        
        Prism.highlightAll();
        // Добавляем toolbar и кнопку копирования к каждому pre
        proseEl.querySelectorAll('pre').forEach(pre => {
          if (pre.closest('.code-block')) return; // уже обработан
          
          // Создаем обертку
          const wrapper = document.createElement('div');
          wrapper.className = 'code-block';
          const bgColor = role === 'user' ? '#fdfeff' : '#f4f8ff';
          const borderColor = role === 'user' ? '#d1d9e6' : '#e0e9f5';
          wrapper.setAttribute('style', `
            background: ${bgColor} !important;
            border-color: ${borderColor} !important;
            border-width: 1px !important;
            border-style: solid !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          `);
          
          // Создаем toolbar
          const toolbar = document.createElement('div');
          toolbar.className = 'code-toolbar';
          toolbar.style.display = 'flex';
          toolbar.style.justifyContent = 'space-between';
          toolbar.style.alignItems = 'center';
          toolbar.style.background = '#f0f6ff';
          toolbar.style.padding = '8px 12px';
          toolbar.style.borderBottom = '1px solid #d4e0f0';
          toolbar.style.fontSize = '11px';
          toolbar.style.fontWeight = '600';
          toolbar.style.color = '#666';
          
          // Определяем язык из класса
          const langClass = pre.className;
          const lang = getLanguageName(langClass);
          
          // Добавляем язык слева
          const langSpan = document.createElement('span');
          langSpan.className = 'code-lang';
          langSpan.style.textTransform = 'uppercase';
          langSpan.style.letterSpacing = '0.5px';
          langSpan.textContent = lang;
          toolbar.appendChild(langSpan);
          
          // Добавляем кнопку справа
          const btn = document.createElement('button');
          btn.className = 'copy-btn';
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
          btn.type = 'button';
          btn.title = 'Copy code';
          btn.style.background = 'none';
          btn.style.border = '1px solid rgba(0,0,0,0.1)';
          btn.style.padding = '4px 8px';
          btn.style.borderRadius = '4px';
          btn.style.cursor = 'pointer';
          btn.style.display = 'inline-flex';
          btn.style.alignItems = 'center';
          btn.style.justifyContent = 'center';
          btn.style.transition = 'background-color 0.2s ease';
          const svg = btn.querySelector('svg') as SVGElement;
          if (svg) {
            svg.style.width = '16px';
            svg.style.height = '16px';
            svg.style.color = '#666';
            svg.style.flexShrink = '0';
          }
          btn.addEventListener('click', handleCopyClick);
          toolbar.appendChild(btn);
          
          // Вставляем обертку и переносим pre в нее
          pre.parentElement?.insertBefore(wrapper, pre);
          wrapper.appendChild(toolbar);
          wrapper.appendChild(pre);
          
          // Устанавливаем background для pre явно с !important
          pre.setAttribute('style', `
            margin: 0 !important;
            padding: 1rem !important;
            background: transparent !important;
            border: none !important;
          `);
        });
        
        // Применяем стили к таблицам
        proseEl.querySelectorAll('table').forEach(table => {
          table.setAttribute('style', `
            border-collapse: collapse !important;
            width: 100% !important;
            margin: 15px 0 !important;
            border: 1px solid #e0e0e0 !important;
          `);
          
          table.querySelectorAll('th, td').forEach(cell => {
            cell.setAttribute('style', `
              border: 1px solid #e0e0e0 !important;
              padding: 10px 12px !important;
              text-align: left !important;
            `);
          });
          
          table.querySelectorAll('th').forEach(th => {
            th.setAttribute('style', `
              border: 1px solid #e0e0e0 !important;
              padding: 10px 12px !important;
              text-align: left !important;
              background-color: #f8f9fa !important;
              font-weight: 600 !important;
              color: #444 !important;
            `);
          });
        });
      }, 500);
    }
  });
</script>

<div class="message-wrapper {role}">
  <div class="message-content">
    <div class="message">
      <div class="prose" bind:this={proseEl}>
        {@html htmlContent}
      </div>
    </div>
    
    <div class="message-actions">
      {#if role === 'user'}
        <button class="action-btn" title="Редактировать" onclick={onEdit}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      {/if}
      
      <button class="action-btn" title="Копировать" onclick={onCopy}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      
      <button class="action-btn" title="Удалить" onclick={onDelete}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </button>
      
      {#if role === 'ai' && isLastMessage}
        <button class="action-btn" title="Перегенерировать" onclick={onRegenerate}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2-8.83"></path>
          </svg>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .message-wrapper { 
    display: flex; 
    width: 100%;
  }
  .message-wrapper.user { 
    justify-content: flex-end;
  }

  .message-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .message { 
    max-width: 85%; 
    padding: 12px 16px; 
    border-radius: 12px; 
    line-height: 1.5; 
    font-size: 0.95rem;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .prose {
    overflow-x: auto;
  }

  /* --- Ваши сообщения (Светло-голубой фон) --- */
  .user .message { 
    background: #e9eef6; 
    color: #2c3e50; /* Темный серо-синий текст */
    border-bottom-right-radius: 2px; 
  }

  /* Таблицы и код в ваших сообщениях */
  .user .prose :global(table) { background: rgba(255, 255, 255, 0.5); }

  /* --- Сообщения ИИ (Белый фон) --- */
  .ai .message { 
    background: #ffffff; 
    color: #222222; 
    border: 1px solid #f0f0f0; /* Тонкая граница, чтобы не сливалось с белым фоном чата */
    border-bottom-left-radius: 2px; 
  }

  /* Улучшенный фон блоков кода для ИИ (чуть более выраженный голубой) */
  .ai .prose :global(pre) { 
    overflow-x: auto;
  }

  /* --- Общие стили для Markdown --- */
  .prose :global(p) { margin-bottom: 0.8rem; }
  .prose :global(p:last-child) { margin-bottom: 0; }

  .prose :global(code) { 
    font-family: 'Fira Code', 'Consolas', monospace;
    font-size: 0.85rem;
    background: rgba(0,0,0,0.04);
    padding: 2px 4px;
    border-radius: 4px;
  }

  /* Убираем фон у инлайнового кода внутри блоков pre */
  .prose :global(pre code) {
    background: none;
    padding: 0;
  }

  /* Обертка для блока кода с toolbar */
  .code-block {
    margin: 10px 0;
    border-radius: 8px;
    overflow: hidden;
  }

  .code-block :global(pre) {
    margin: 0 !important;
    padding: 1rem !important;
    background: transparent !important;
    border: none !important;
  }

  /* Toolbar - шапка с языком и кнопкой копирования */
  .code-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f0f6ff;
    padding: 8px 12px;
    border-bottom: 1px solid #d4e0f0;
    font-size: 11px;
    font-weight: 600;
    color: #666;
  }

  .code-lang {
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Кнопка копирования */
  .copy-btn {
    background: none;
    border: 1px solid rgba(0,0,0,0.1);
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s ease;
  }
  .copy-btn:hover {
    background: rgba(0,0,0,0.05);
  }

  /* Кнопки действий для сообщений */
  .message-actions {
    display: flex;
    gap: 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
    flex-shrink: 0;
  }

  .message-wrapper:hover .message-actions {
    opacity: 1;
  }

  .action-btn {
    background: none;
    border: 1px solid rgba(0,0,0,0.1);
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    color: #666;
  }

  .action-btn:hover {
    background: rgba(0,0,0,0.05);
    border-color: rgba(0,0,0,0.2);
  }

  .action-btn svg {
    width: 16px;
    height: 16px;
  }
</style>
