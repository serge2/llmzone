<!-- src/lib/components/AboutModal.svelte -->
<script lang="ts">
  import * as m from '$paraglide/messages';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import closeIcon from '$lib/assets/icons/close.svg?raw';

  const appVersion = __APP_VERSION__;

  let { onClose } = $props<{ onClose: () => void }>();

  const libs = [
    { name: 'Tauri', license: 'MIT/Apache 2.0', url: 'https://tauri.app/' },
    { name: 'Svelte 5', license: 'MIT', url: 'https://svelte.dev/' },
    { name: 'Marked', license: 'MIT', url: 'https://marked.js.org/' },
    { name: 'PrismJS', license: 'MIT', url: 'https://prismjs.com/' },
    { name: 'MCP SDK', license: 'Apache 2.0', url: 'https://github.com/modelcontextprotocol' },
    { name: 'Paraglide-js', license: 'Apache 2.0', url: 'https://inlang.com/' }
  ];

  function handleLink(url: string) {
    openUrl(url).catch(console.error);
  }
</script>

<div class="about-card">
  <div class="header">
    <div class="title-group">
      <h2>LLM Zone</h2>
      <span class="version">v{appVersion}</span>
    </div>
    <button class="icon-btn close-x" onclick={onClose}>
      {@html closeIcon}
    </button>
  </div>

  <div class="content">
    <p class="description">
      {m.about_description({ app_name: 'LLM Zone' })}
    </p>

    <div class="credits-section">
      <span class="section-label">{m.about_libs_title()}</span>
      <div class="lib-grid">
        {#each libs as lib}
          <button class="lib-item" onclick={() => handleLink(lib.url)}>
            <span class="lib-name">{lib.name}</span>
            <span class="lib-license">{lib.license}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="footer-note">
      <p>{m.about_copy()}</p>
      <p class="ai-note">{m.about_ai_note()}</p>
    </div>
  </div>
</div>

<style>
  /* Стили остаются без изменений, как в предыдущем ответе */
  .about-card {
    background: white;
    width: 400px;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    overflow: hidden;
    color: #111827;
  }
  .header {
    padding: 16px 20px;
    border-bottom: 1px solid #f3f4f6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .title-group { display: flex; align-items: baseline; gap: 8px; }
  .title-group h2 { margin: 0; font-size: 1.25rem; font-weight: 700; }
  .version { font-size: 0.75rem; color: #6b7280; font-family: monospace; }
  
  .content { padding: 20px; }
  .description { 
    font-size: 0.95rem; 
    color: #374151; 
    margin-bottom: 24px; 
    line-height: 1.5; 
    text-align: center;
  }
  
  .section-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    display: block;
    margin-bottom: 10px;
    letter-spacing: 0.05em;
  }

  .lib-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 24px;
  }

  .lib-item {
    background: #f9fafb;
    border: 1px solid #f3f4f6;
    padding: 8px 12px;
    border-radius: 8px;
    text-align: left;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition: all 0.2s;
  }

  .lib-item:hover { 
    background: #f3f4f6; 
    border-color: #e5e7eb;
    transform: translateY(-1px);
  }
  
  .lib-name { font-size: 0.85rem; font-weight: 600; color: #111827; }
  .lib-license { font-size: 0.7rem; color: #6b7280; }

  .footer-note {
    text-align: center;
    font-size: 0.75rem;
    color: #9ca3af;
    border-top: 1px solid #f3f4f6;
    padding-top: 16px;
  }
  .ai-note { font-style: italic; margin-top: 2px; }

  .icon-btn {
    background: none; border: none; cursor: pointer; color: #9ca3af;
    padding: 4px; display: flex; align-items: center; border-radius: 6px;
  }
  .icon-btn:hover { background: #f3f4f6; color: #111827; }
  :global(.close-x svg) { width: 20px; height: 20px; }
</style>
