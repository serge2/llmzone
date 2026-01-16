<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { untrack } from 'svelte';
  import type { Workspace } from '$lib/types';
  
  // Импорт иконок из ассетов
  import CloseIcon from '$lib/assets/icons/close.svg?raw';
  import ExpandIcon from '$lib/assets/icons/edit.svg?raw';

  // --- НОВЫЕ ИМПОРТЫ ---
  import MCPServerWidget from './MCPServerWidget.svelte';
  import { MCPServerInstance } from '$lib/mcp/manager.svelte';

  let { 
    currentWorkspace = $bindable(), 
    serverInstances = $bindable([]), // Делаем список инстансов биндабельным пропом
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace, 
    serverInstances: MCPServerInstance[],
    onSettingsChange: () => void 
  } = $props();

  let isSaved = $state(false);
  let isExpanded = $state(false);
  
  // Локальный буфер текста для редактирования
  let configBuffer = $state(currentWorkspace.settings.mcpConfig || '');
  let lastWorkspaceId = $state(currentWorkspace.id);

  // --- ЛОГИКА ВИДЖЕТОВ ---
  // (serverInstances теперь управляется в +page.svelte. Здесь мы только отображаем и триггерим обновление)

  // Следим за сменой воркспейса для обновления буфера текста
  $effect(() => {
    const currentId = currentWorkspace.id;
    const currentConfig = currentWorkspace.settings.mcpConfig || '';

    if (currentId !== lastWorkspaceId) {
      untrack(() => {
        lastWorkspaceId = currentId;
        configBuffer = currentConfig;
      });
    }
  });

  const jsonError = $derived.by(() => {
    const trimmed = configBuffer.trim();
    if (!trimmed) return null; 
    try {
      JSON.parse(trimmed);
      return null;
    } catch (e: any) {
      return e.message;
    }
  });

  const isDirty = $derived(configBuffer !== (currentWorkspace.settings.mcpConfig || ''));
  const canSave = $derived(isDirty && !jsonError);

  function validateAndSave() {
    // 1. Обновляем данные в объекте воркспейса
    currentWorkspace.settings.mcpConfig = configBuffer;
    isSaved = true;
    
    // 2. Вызываем корневой обработчик. 
    // В +page.svelte функция onSettingsChange теперь должна вызывать syncMCPServers()
    onSettingsChange();
    
    setTimeout(() => { 
      isSaved = false; 
      isExpanded = false; 
    }, 600);
  }

  function handleCancel() {
    configBuffer = currentWorkspace.settings.mcpConfig || '';
    isExpanded = false;
  }
</script>

<div class="tab-tools">
  <div class="header-row">
    <span class="label-text">Конфигурация MCP</span>
    <button class="config-btn" onclick={() => isExpanded = true}>
      {@html ExpandIcon}
      <span>Конфигурация</span>
    </button>
  </div>

  <p class="info-text">Настройте MCP-серверы для расширения возможностей модели инструментами.</p>

  {#if serverInstances.length > 0}
    <div class="servers-list">
      {#each serverInstances as server (server.name + server.url)}
        <MCPServerWidget {server} />
      {/each}
    </div>
  {:else}
    <div class="empty-placeholder">
       Нет активных MCP серверов. Добавьте их в конфигурацию.
    </div>
  {/if}

  {#if isExpanded}
    <div 
      class="overlay-backdrop" 
      transition:fade={{ duration: 200 }} 
      onclick={handleCancel}
      role="presentation"
    ></div>

    <div 
      class="expanded-editor-panel" 
      transition:fly={{ x: 100, duration: 400, easing: cubicOut }}
    >
      <div class="panel-header">
        <div class="title-group">
          <h3>Настройка MCP-серверов</h3>
          <span class="workspace-badge">Воркспейс: {currentWorkspace.name}</span>
        </div>
        <button class="icon-close-btn" onclick={handleCancel} title="Закрыть без сохранения">
          {@html CloseIcon}
        </button>
      </div>

      <div class="panel-body">
        <div class="editor-top-bar">
          <span class="hint">На данный момент есть поддержка только Streamable HTTP(S) серверов</span>
          {#if jsonError}
            <span class="error-badge">Ошибка валидации</span>
          {/if}
        </div>
        
        <div class="textarea-container">
          <textarea
            class="mcp-textarea"
            class:has-error={!!jsonError}
            bind:value={configBuffer}
            spellcheck="false"
            placeholder={`{
  "mcpServers": {
    "weather": {
      "url": "http://localhost:3001/v1",
      "headers": { "Authorization": "Bearer token" }
    }
  }
}`}
          ></textarea>
        </div>
        
        {#if jsonError}
          <div class="error-details">
            <strong>Ошибка в структуре JSON:</strong><br>
            {jsonError}
          </div>
        {/if}
      </div>

      <div class="panel-footer">
        <button class="secondary-btn" onclick={handleCancel}>Отмена</button>
        <button 
          class="primary-btn" 
          class:is-success={isSaved}
          onclick={validateAndSave}
          disabled={!canSave}
        >
          {isSaved ? 'Сохранено!' : 'Применить изменения'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Стили сохранены без изменений */
  .tab-tools { display: flex; flex-direction: column; gap: 12px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  .info-text { font-size: 0.85rem; color: #6b7280; line-height: 1.4; margin-top: -4px; }
  .config-btn { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: none; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; color: #6b7280; font-size: 0.75rem; font-weight: 500; transition: all 0.2s; }
  .config-btn:hover { background: #f3f4f6; border-color: #d1d5db; color: #111827; }
  .config-btn :global(svg) { width: 12px; height: 12px; }
  .servers-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  
  .empty-placeholder {
    padding: 20px;
    text-align: center;
    border: 1px dashed #e5e7eb;
    border-radius: 8px;
    color: #9ca3af;
    font-size: 0.85rem;
  }

  .overlay-backdrop { position: absolute; top: 0; left: 0; right: 100%; width: 200vw; height: 100%; background: rgba(15, 23, 42, 0.15); backdrop-filter: blur(2px); z-index: 800; }
  .expanded-editor-panel { position: absolute; top: 0; right: 100%; width: calc(100vw - 380px - 40px); height: 100%; background: #ffffff; z-index: 850; display: flex; flex-direction: column; box-shadow: -15px 0 30px rgba(0, 0, 0, 0.05); border-left: 1px solid #e5e7eb; }
  .panel-header { padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; }
  .panel-header h3 { margin: 0; font-size: 1.1rem; font-weight: 600; color: #1e293b; }
  .workspace-badge { font-size: 0.75rem; color: #64748b; margin-top: 4px; display: inline-block; }
  .panel-body { flex: 1; padding: 24px 32px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
  .editor-top-bar { display: flex; justify-content: space-between; align-items: center; }
  .hint { font-size: 0.85rem; color: #94a3b8; }
  .error-badge { font-size: 0.7rem; color: #ef4444; background: #fef2f2; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .textarea-container { flex: 1; width: 100%; position: relative; }
  .mcp-textarea { position: absolute; inset: 0; width: 100%; height: 100%; box-sizing: border-box; font-family: 'ui-monospace', monospace; font-size: 0.9rem; line-height: 1.6; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc; color: #334155; outline: none; resize: none; transition: all 0.2s; }
  .mcp-textarea:focus { border-color: #5865f2; background: #ffffff; box-shadow: 0 4px 20px rgba(88, 101, 242, 0.05); }
  .mcp-textarea.has-error { border-color: #ef4444; background: #fffcfc; }
  .error-details { font-size: 0.8rem; color: #ef4444; background: #fef2f2; padding: 12px; border-radius: 8px; border-left: 4px solid #ef4444; }
  .panel-footer { padding: 20px 32px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 12px; background: #ffffff; }
  .primary-btn { padding: 10px 24px; background: #2f2f2f; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .primary-btn:hover:not(:disabled) { background: #000; }
  .primary-btn.is-success { background: #10b981; }
  .primary-btn:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed; }
  .secondary-btn { background: none; border: 1px solid #e2e8f0; color: #64748b; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 500; }
  .icon-close-btn { background: none; border: none; cursor: pointer; color: #94a3b8; padding: 8px; border-radius: 50%; display: flex; transition: all 0.2s; }
  .icon-close-btn:hover { background: #f1f5f9; color: #1e293b; }
  .icon-close-btn :global(svg) { width: 20px; height: 20px; }
</style>