<script lang="ts">
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { untrack } from 'svelte';
  import type { Workspace } from '$lib/types';
  
  // Импорт локализации
  import * as m from '$paraglide/messages';

  // Импорт иконок из ассетов
  import CloseIcon from '$lib/assets/icons/close.svg?raw';
  import ExpandIcon from '$lib/assets/icons/edit.svg?raw';
  import SettingsIcon from '$lib/assets/icons/settings.svg?raw';
  import ChevronIcon from '$lib/assets/icons/chevron-down.svg?raw';
  import HelpIcon from '$lib/assets/icons/help.svg?raw';

  // --- НОВЫЕ ИМПОРТЫ ---
  import MCPServerWidget from './MCPServerWidget.svelte';
  import { mcpManager } from '$lib/mcp/manager.svelte';

  let { 
    currentWorkspace = $bindable(), 
    currentLocale, // Добавляем проп для локали
    serverInstances = $bindable([]), // Делаем список инстансов биндабельным пропом
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace, 
    currentLocale: string, // Типизация локали
    serverInstances: any[],
    onSettingsChange: () => void 
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  let isSaved = $state(false);
  let isExpanded = $state(false);
  let isSettingsOpen = $state(false); // Состояние сворачивания виджета настроек
  
  // Локальный буфер текста для редактирования
  let configBuffer = $state(currentWorkspace.settings.mcpConfig || '');
  let lastWorkspaceId = $state(currentWorkspace.id);

  // --- ЛОГИКА СИНХРОНИЗАЦИИ ---

  // 1. Следим за сменой воркспейса для обновления буфера текста
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

  // 2. ОБРАБОТЧИК ИЗМЕНЕНИЯ ТАЙМАУТА
  // Вместо сложного effect с untrack используем прямой вызов при изменении
  function handleTimeoutChange() {
    const sec = currentWorkspace.settings.mcpTimeout || 300;
    // Обновляем менеджер (он реактивно подхватит это для новых запросов)
    mcpManager.globalTimeout = sec;
    // Сохраняем настройки
    onSettingsChange();
  }

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

  // Грязным считается только текстовый конфиг
  const isDirty = $derived(
    configBuffer !== (currentWorkspace.settings.mcpConfig || '')
  );
  const canSave = $derived(isDirty && !jsonError);

  function validateAndSave() {
    currentWorkspace.settings.mcpConfig = configBuffer;
    isSaved = true;
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
    <span class="label-text">{_i18n && m.tab_tools_config_label()}</span>
    <button class="config-btn" onclick={() => isExpanded = true}>
      {@html ExpandIcon}
      <span>{_i18n && m.tab_tools_config_button()}</span>
    </button>
  </div>

  <p class="info-text">{_i18n && m.tab_tools_info_text()}</p>

  <div class="mcp-settings-widget" class:is-open={isSettingsOpen}>
    <button class="settings-trigger" onclick={() => isSettingsOpen = !isSettingsOpen}>
      <div class="trigger-left">
        <span class="settings-icon">{@html SettingsIcon}</span>
        <span class="settings-title">{_i18n && m.mcp_settings_widget_title()}</span>
      </div>
      <span class="chevron" class:rotated={isSettingsOpen}>{@html ChevronIcon}</span>
    </button>

    {#if isSettingsOpen}
      <div class="settings-content" transition:slide={{ duration: 250 }}>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-name">{_i18n && m.mcp_settings_timeout_label()}</span>
            <div class="tooltip-container">
              <span class="help-icon">{@html HelpIcon}</span>
              <div class="tooltip-box">
                {_i18n && m.mcp_settings_timeout_hint()}
              </div>
            </div>
          </div>
          <div class="setting-control">
            <input 
              type="number" 
              bind:value={currentWorkspace.settings.mcpTimeout} 
              onchange={handleTimeoutChange}
              min="1" 
              max="3600"
              class="timeout-input"
            />
            <span class="unit-text">{_i18n && m.common_seconds_short()}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  {#if serverInstances.length > 0}
    <div class="servers-list">
      {#each serverInstances as server (server.name + server.url)}
        <MCPServerWidget {server}
          currentLocale={currentLocale}
        />
      {/each}
    </div>
  {:else}
    <div class="empty-placeholder">
       {_i18n && m.tab_tools_empty_placeholder()}
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
          <h3>{_i18n && m.tab_tools_editor_title()}</h3>
          <span class="workspace-badge">{_i18n && m.tab_tools_workspace_label()} {currentWorkspace.name}</span>
        </div>
        <button class="icon-close-btn" onclick={handleCancel} title={_i18n && m.tab_tools_close_hint()}>
          {@html CloseIcon}
        </button>
      </div>

      <div class="panel-body">
        <div class="editor-top-bar">
          <span class="hint">{_i18n && m.tab_tools_http_hint()}</span>
          {#if jsonError}
            <span class="error-badge">{_i18n && m.tab_tools_validation_error()}</span>
          {/if}
        </div>
        
        <div class="textarea-container">
          <textarea
            class="mcp-textarea"
            class:has-error={!!jsonError}
            bind:value={configBuffer}
            spellcheck="false"
          ></textarea>
        </div>
        
        {#if jsonError}
          <div class="error-details">
            <strong>{_i18n && m.tab_tools_json_error_prefix()}</strong><br>
            {jsonError}
          </div>
        {/if}
      </div>

      <div class="panel-footer">
        <button class="secondary-btn" onclick={handleCancel}>{_i18n && m.tab_tools_cancel()}</button>
        <button 
          class="primary-btn" 
          class:is-success={isSaved}
          onclick={validateAndSave}
          disabled={!canSave}
        >
          {isSaved ? (_i18n && m.tab_tools_saved_status()) : (_i18n && m.tab_tools_apply_button())}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Стили без изменений */
  .tab-tools { display: flex; flex-direction: column; gap: 12px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  .info-text { font-size: 0.85rem; color: #6b7280; line-height: 1.4; margin-top: -4px; }
  .config-btn { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: none; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; color: #6b7280; font-size: 0.75rem; font-weight: 500; transition: all 0.2s; }
  .config-btn:hover { background: #f3f4f6; border-color: #d1d5db; color: #111827; }
  .config-btn :global(svg) { width: 12px; height: 12px; }

  .mcp-settings-widget {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .mcp-settings-widget.is-open {
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .settings-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #f8fafc;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
  }
  .settings-trigger:hover { background: #f1f5f9; }
  .trigger-left { display: flex; align-items: center; gap: 8px; }
  .settings-icon :global(svg) { width: 14px; height: 14px; color: #64748b; }
  .settings-title { font-size: 0.85rem; font-weight: 600; color: #475569; }
  .chevron :global(svg) { width: 14px; height: 14px; color: #94a3b8; transition: transform 0.2s; }
  .chevron.rotated :global(svg) { transform: rotate(180deg); }
  
  .settings-content {
    padding: 12px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .setting-row { display: flex; justify-content: space-between; align-items: center; }
  .setting-info { display: flex; align-items: center; gap: 6px; }
  .setting-name { font-size: 0.8rem; font-weight: 500; color: #475569; }

  .tooltip-container { position: relative; display: flex; align-items: center; }
  .help-icon { display: flex; color: #94a3b8; cursor: help; }
  .help-icon :global(svg) { width: 13px; height: 13px; }
  .tooltip-box { 
    position: absolute; 
    bottom: calc(100% + 8px); 
    left: 50%; 
    transform: translateX(-50%);
    width: 200px;
    padding: 8px 10px;
    background: #1e293b;
    color: #ffffff;
    font-size: 0.7rem;
    line-height: 1.3;
    border-radius: 6px;
    visibility: hidden;
    opacity: 0;
    transition: all 0.2s;
    z-index: 100;
    pointer-events: none;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .tooltip-box::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: #1e293b transparent transparent transparent;
  }
  .tooltip-container:hover .tooltip-box { visibility: visible; opacity: 1; bottom: calc(100% + 5px); }

  .setting-control { display: flex; align-items: center; gap: 6px; }
  .timeout-input {
    width: 55px;
    padding: 4px 6px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 0.8rem;
    text-align: center;
    outline: none;
    transition: border-color 0.2s;
  }
  .timeout-input:focus { border-color: #5865f2; }
  .unit-text { font-size: 0.75rem; color: #94a3b8; }

  .servers-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .empty-placeholder { padding: 20px; text-align: center; border: 1px dashed #e5e7eb; border-radius: 8px; color: #9ca3af; font-size: 0.85rem; }

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