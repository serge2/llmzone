<script lang="ts">
  import { slide, fade } from 'svelte/transition';
  import type { MCPServerInstance } from '$lib/mcp/manager.svelte';
  
  // Импорт локализации
  import * as m from '$paraglide/messages';

  // Импорт иконок
  import ChevronIcon from '$lib/assets/icons/chevron-down.svg?raw';
  import QuestionIcon from '$lib/assets/icons/help.svg?raw'; 
  import RestartIcon from '$lib/assets/icons/refresh.svg?raw';

  let { 
    server,
    currentLocale // Принимаем локаль от родителя (TabTools)
  }: { 
    server: MCPServerInstance,
    currentLocale: string 
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);
  
  // Состояние тултипов остается локальным
  let activeTooltip = $state<string | null>(null);

  function toggleTooltip(name: string, e: MouseEvent) {
    e.stopPropagation();
    activeTooltip = activeTooltip === name ? null : name;
  }

  function closeTooltip() {
    activeTooltip = null;
  }

  async function handleRestart() {
    await server.disconnect();
    await server.connect();
  }

  // Переключение состояния развернутости виджета
  function toggleExpanded() {
    server.isExpanded = !server.isExpanded;
    server.notify();
  }

  // При изменении политики (Разрешить все / Спрашивать)
  function togglePolicy() {
    server.autoApproveAll = !server.autoApproveAll;
    server.notify();
  }

  // При изменении состояния конкретного инструмента
  function handleToolToggle() {
    server.notify();
  }
</script>

<svelte:window onclick={closeTooltip} />

<div class="server-card" class:is-loading={server.isLoading}>
  <div class="card-main">
    <button 
      class="expand-btn" 
      class:is-expanded={server.isExpanded}
      onclick={toggleExpanded}
    >
      {@html ChevronIcon}
    </button>
    
    <div class="info">
      <div class="name">{server.name}</div>
      <div class="url">{server.url}</div>
    </div>

    <div class="actions">
      <button 
        class="restart-btn" 
        onclick={handleRestart} 
        disabled={server.isLoading}
        title={_i18n && m.mcp_widget_restart_title()}
      >
        {@html RestartIcon}
      </button>

      <label class="switch">
        <input 
          type="checkbox" 
          checked={server.enabled} 
          onchange={() => server.toggle()}
          disabled={server.isLoading}
        >
        <span class="slider"></span>
      </label>
    </div>
  </div>

  {#if server.error}
    <div class="error-msg" transition:slide>
      {server.error}
    </div>
  {/if}

  {#if server.isExpanded}
    <div class="details" transition:slide>
      {#if server.tools.length > 0}
        <div class="tools-list">
          <div class="section-header">
            <div class="section-title">{_i18n && m.mcp_widget_tools_title()}</div>
            
            <div class="global-policy">
              <span class="policy-label">{server.autoApproveAll ? (_i18n && m.mcp_widget_policy_allow_all()) : (_i18n && m.mcp_widget_policy_control())}</span>
              <button 
                class="policy-toggle" 
                onclick={togglePolicy}
                class:is-active={server.autoApproveAll}
                title={_i18n && m.mcp_widget_policy_toggle_title()}
              >
                <div class="toggle-track"></div>
              </button>
            </div>
          </div>

          {#each server.tools as tool}
            <div class="tool-item">
              <div class="tool-control-group">
                <input 
                  type="checkbox" 
                  id="tool-{server.name}-{tool.name}"
                  bind:checked={tool.enabled}
                  onchange={handleToolToggle}
                  class="tool-checkbox"
                >
                <label for="tool-{server.name}-{tool.name}" class="tool-name">
                  {tool.name}
                </label>
              </div>
              
              <div class="tool-actions">
                {#if !server.autoApproveAll && tool.enabled}
                  <button 
                    class="auth-badge" 
                    class:is-trusted={tool.alwaysAllow}
                    onclick={() => { tool.alwaysAllow = !tool.alwaysAllow; server.notify(); }}
                    title={tool.alwaysAllow ? (_i18n && m.mcp_widget_tool_auto_title()) : (_i18n && m.mcp_widget_tool_ask_title())}
                  >
                    {tool.alwaysAllow ? (_i18n && m.mcp_widget_tool_allow()) : (_i18n && m.mcp_widget_tool_ask())}
                  </button>
                {/if}

                {#if tool.description}
                  <div class="tooltip-container">
                    <button 
                      class="help-btn" 
                      onclick={(e) => toggleTooltip(tool.name, e)}
                    >
                      {@html QuestionIcon}
                    </button>

                    {#if activeTooltip === tool.name}
                      <div class="tooltip-box" transition:fade={{ duration: 100 }}>
                        <div class="tooltip-content">
                          {tool.description}
                        </div>
                        <div class="tooltip-arrow"></div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else if !server.isLoading}
        <div class="empty-state">{_i18n && m.mcp_widget_empty_tools()}</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Стили сохранены без изменений */
  .server-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: visible; transition: all 0.2s; position: relative; }
  .card-main { display: flex; align-items: center; padding: 12px; gap: 12px; }
  .expand-btn { background: none; border: none; cursor: pointer; color: #94a3b8; display: flex; transition: transform 0.2s; padding: 4px; }
  .expand-btn.is-expanded { transform: rotate(180deg); }
  .expand-btn :global(svg) { width: 16px; height: 16px; }
  .info { flex: 1; min-width: 0; }
  .name { font-weight: 600; font-size: 0.9rem; color: #1f2937; }
  .url { font-size: 0.75rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .actions { display: flex; align-items: center; gap: 12px; }
  .restart-btn { background: none; border: none; cursor: pointer; color: #94a3b8; padding: 6px; display: flex; border-radius: 6px; transition: all 0.2s; }
  .restart-btn:hover { color: #6366f1; background: #f5f3ff; }
  .restart-btn :global(svg) { width: 16px; height: 16px; }
  .restart-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .switch { position: relative; display: inline-block; width: 34px; height: 20px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; inset: 0; background-color: #e5e7eb; transition: .4s; border-radius: 20px; }
  .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
  input:checked + .slider { background-color: #10b981; }
  input:checked + .slider:before { transform: translateX(14px); }
  .details { border-top: 1px solid #f3f4f6; padding: 12px; background: #f9fafb; }
  .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .section-title { font-size: 0.75rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; }
  .global-policy { display: flex; align-items: center; gap: 8px; }
  .policy-label { font-size: 0.7rem; color: #64748b; font-weight: 500; }
  .policy-toggle { width: 28px; height: 14px; background: #e2e8f0; border-radius: 10px; border: none; cursor: pointer; position: relative; padding: 0; transition: background 0.2s; }
  .toggle-track { position: absolute; left: 2px; top: 2px; width: 10px; height: 10px; background: white; border-radius: 50%; transition: transform 0.2s; }
  .policy-toggle.is-active { background: #6366f1; }
  .policy-toggle.is-active .toggle-track { transform: translateX(14px); }
  .tools-list { display: flex; flex-direction: column; gap: 2px; }
  .tool-item { display: flex; align-items: center; justify-content: space-between; background: white; padding: 0px 0px; border-radius: 4px; border: 1px solid #f1f5f9; }
  .tool-control-group { display: flex; align-items: center; gap: 8px; flex: 1; }
  .tool-checkbox { cursor: pointer; width: 14px; height: 14px; margin: 0; }
  .tool-name { font-size: 0.75rem; color: #374151; font-family: monospace; cursor: pointer; user-select: none; }
  .tool-actions { display: flex; align-items: center; gap: 8px; }
  .auth-badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0; cursor: pointer; transition: all 0.2s; background: #f8fafc; color: #64748b; white-space: nowrap; }
  .auth-badge.is-trusted { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
  .tooltip-container { position: relative; display: flex; align-items: center; }
  .help-btn { background: none; border: none; cursor: pointer; color: #94a3b8; padding: 4px; display: flex; transition: color 0.2s; }
  .help-btn:hover { color: #5865f2; }
  .help-btn :global(svg) { width: 14px; height: 14px; }
  .tooltip-box { position: absolute; bottom: calc(100% + 10px); right: 0; width: 220px; background: #1e293b; color: white; padding: 10px; border-radius: 8px; font-size: 0.75rem; line-height: 1.4; z-index: 1000; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
  .tooltip-arrow { position: absolute; top: 100%; right: 6px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #1e293b; }
  .error-msg { padding: 8px 12px; font-size: 0.8rem; color: #ef4444; background: #fef2f2; border-top: 1px solid #fee2e2; }
  .empty-state { padding: 12px; text-align: center; font-size: 0.8rem; color: #9ca3af; font-style: italic; }
</style>
