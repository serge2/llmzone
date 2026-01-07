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

  let { text, role } = $props<{ text: string, role: string }>();
  let htmlContent = $derived(marked.parse(text || ''));

  $effect(() => {
    if (htmlContent) {
      // Таймаут нужен, чтобы Svelte успел отрендерить HTML в DOM
      setTimeout(() => Prism.highlightAll(), 0);
    }
  });
</script>

<div class="message-wrapper {role}">
  <div class="message">
    <div class="prose">
      {@html htmlContent}
    </div>
  </div>
</div>

<style>
  .message-wrapper { display: flex; width: 100%; margin-bottom: 16px; }
  .message-wrapper.user { justify-content: flex-end; }
  
  .message { 
    max-width: 85%; 
    padding: 12px 16px; 
    border-radius: 12px; 
    line-height: 1.5; 
    font-size: 0.95rem;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05); /* Легкая тень для объема */
  }

  /* --- Ваши сообщения (Светло-голубой фон) --- */
  .user .message { 
    background: #e9eef6; 
    color: #2c3e50; /* Темный серо-синий текст */
    border-bottom-right-radius: 2px; 
  }

  /* Таблицы и код в ваших сообщениях */
  .user .prose :global(table) { background: rgba(255, 255, 255, 0.5); }
  .user .prose :global(pre) { 
    background: #fdfeff !important; 
    border: 1px solid #d1d9e6; 
  }

  /* --- Сообщения ИИ (Белый фон) --- */
  .ai .message { 
    background: #ffffff; 
    color: #222222; 
    border: 1px solid #f0f0f0; /* Тонкая граница, чтобы не сливалось с белым фоном чата */
    border-bottom-left-radius: 2px; 
  }

  /* Улучшенный фон блоков кода для ИИ (чуть более выраженный голубой) */
  .ai .prose :global(pre) { 
    background: #f4f8ff !important; 
    border: 1px solid #e0e9f5;
    padding: 1rem; 
    border-radius: 8px; 
    overflow-x: auto; 
    margin: 10px 0;
  }

  /* --- Общие стили для Markdown --- */
  .prose :global(p) { margin-bottom: 0.8rem; }
  .prose :global(p:last-child) { margin-bottom: 0; }

  /* Стили таблиц для светлых тем */
  .prose :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 15px 0;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid #e0e0e0;
  }

  .prose :global(th), .prose :global(td) {
    border: 1px solid #e0e0e0;
    padding: 10px 12px;
    text-align: left;
  }

  .prose :global(th) {
    background-color: #f8f9fa;
    font-weight: 600;
    color: #444;
  }

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
</style>