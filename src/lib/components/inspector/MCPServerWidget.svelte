<script lang="ts">
  import { slide, fade } from 'svelte/transition';
  import type { MCPServerInstance } from '$lib/mcp/manager.svelte';
  
  // Импорт локализации
  import * as m from '$paraglide/messages';

  // Импорт иконок
  import ChevronIcon from '$lib/assets/icons/chevron-down.svg?raw';
  import QuestionIcon from '$lib/assets/icons/help.svg?raw'; 
  import GlobeIcon from '$lib/assets/icons/globe.svg?raw'; 
  import TerminalIcon from '$lib/assets/icons/terminal.svg?raw';

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

  // Определяем, является ли сервер локальным процессом
  // @ts-ignore - обращаемся к приватному конфигу для отображения
  const isLocal = $derived(!!server.config.command);
  // @ts-ignore
  const displaySource = $derived(isLocal ? `${server.config.command} ${server.config.args?.join(' ') || ''}` : server.url);

  // Расчет прогресса для последовательного заполнения стрелки
  const tailProgress = $derived(Math.min(server.retryProgress / 80, 1));
  const headProgress = $derived(server.retryProgress > 80 ? (server.retryProgress - 80) / 20 : 0);

  function toggleTooltip(name: string, e: MouseEvent) {
    e.stopPropagation();
    activeTooltip = activeTooltip === name ? null : name;
  }

  function closeTooltip() {
    activeTooltip = null;
  }

  async function handleRestart() {
    // Используем новый метод реконнекта, который не меняет состояние тогла
    await server.reconnect();
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

<div 
  class="server-card" 
  class:is-loading={server.isLoading} 
  class:is-disabled={!server.enabled}
  class:is-online={server.isConnected}
  class:has-error={!!server.error}
>
  <div class="card-main">
    <label class="switch">
      <input 
        type="checkbox" 
        checked={server.enabled} 
        onchange={() => server.toggle()}
        disabled={server.isLoading}
      >
      <span class="slider"></span>
    </label>
    
    <div class="type-icon-wrapper">
      <div class="type-icon" title={isLocal ? "Local Process" : "Remote SSE"}>
        {@html isLocal ? TerminalIcon : GlobeIcon}
      </div>
      <div 
        class="status-indicator" 
        class:is-connected={server.isConnected} 
        class:is-error={!!server.error}
      ></div>
    </div>

    <div class="info">
      <div class="name">{server.name}</div>
      <div class="url" title={displaySource}>{displaySource}</div>
    </div>

    <div class="actions">
      <button 
        class="restart-btn" 
        class:is-retrying={server.retryProgress > 0}
        onclick={handleRestart} 
        disabled={server.isLoading || !server.enabled}
        title={server.retryProgress > 0 ? `Retrying...` : (_i18n && m.mcp_widget_restart_title())}
      >
        <div class="restart-visual">
          <svg viewBox="0 0 24 24" class="restart-svg">
            <g class="base-layer">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2-8.83"></path>
            </g>
            
            {#if server.retryProgress > 0}
              <g class="progress-layer">
                <polyline 
                  points="23 4 23 10 17 10" 
                  pathLength="1"
                  style="stroke-dashoffset: {1 - headProgress}"
                ></polyline>
                <path 
                  d="M20.49 15a9 9 0 1 1-2-8.83" 
                  pathLength="1"
                  style="stroke-dashoffset: {1 - tailProgress}"
                ></path>
              </g>
            {/if}
          </svg>
        </div>
      </button>

      <button 
        class="expand-btn" 
        class:is-expanded={server.isExpanded}
        onclick={toggleExpanded}
      >
        {@html ChevronIcon}
      </button>

      
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
  /* Стили сохранены и дополнены */
  .server-card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: visible; transition: all 0.2s; position: relative; }
  .server-card.is-disabled { opacity: 0.6; border-style: dashed; background: #fcfcfc; }
  .server-card.is-online { border-color: #10b98133; box-shadow: 0 2px 4px -1px rgba(16, 185, 129, 0.06); }
  .server-card.has-error:not(.is-disabled) { border-color: #ef444433; }

  .card-main { display: flex; align-items: center; padding: 12px; gap: 12px; }
  .expand-btn { background: none; border: none; cursor: pointer; color: #94a3b8; display: flex; transition: transform 0.2s; padding: 4px; }
  .expand-btn.is-expanded { transform: rotate(180deg); }
  .expand-btn :global(svg) { width: 16px; height: 16px; }
  
  /* Контейнер для иконки и индикатора */
  .type-icon-wrapper { position: relative; display: flex; align-items: center; justify-content: center; }
  .type-icon { color: #94a3b8; display: flex; align-items: center; opacity: 0.7; }
  .type-icon :global(svg) { width: 14px; height: 14px; }

  .status-indicator { 
    position: absolute; 
    bottom: -2px; 
    right: -2px; 
    width: 7px; 
    height: 7px; 
    border-radius: 50%; 
    background: #d1d5db; 
    border: 1.5px solid white; 
  }
  .status-indicator.is-connected { background: #10b981; box-shadow: 0 0 4px #10b981; }
  .status-indicator.is-error { background: #ef4444; }

  .info { flex: 1; min-width: 0; }
  .name { font-weight: 600; font-size: 0.9rem; color: #1f2937; }
  .url { font-size: 0.75rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  
  .actions { display: flex; align-items: center; gap: 12px; }
  
  /* Обновленные стили кнопки рестарта с анимацией контура */
  .restart-btn { 
    background: none; 
    border: none; 
    cursor: pointer; 
    padding: 6px; 
    display: flex; 
    align-items: center;
    justify-content: center;
    border-radius: 6px; 
    transition: all 0.2s; 
  }
  
  .restart-visual {
    width: 16px;
    height: 16px;
    position: relative;
  }

  .restart-svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .base-layer { stroke: #94a3b8; }
  .progress-layer { stroke: #6366f1; }

  .progress-layer polyline,
  .progress-layer path {
    stroke-dasharray: 1;
    transition: stroke-dashoffset 0.1s linear;
  }

  .restart-btn.is-retrying .base-layer { stroke: #e2e8f0; }
  .restart-btn:hover:not(:disabled):not(.is-retrying) { background: #f5f3ff; }
  .restart-btn:hover:not(:disabled):not(.is-retrying) .base-layer { stroke: #6366f1; }
  .restart-btn:disabled { opacity: 0.3; cursor: not-allowed; }

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
  .tools-list { display: flex; flex-direction: column; gap: 1px; }
  .tool-item { display: flex; align-items: center; justify-content: space-between; background: white; padding: 0px 0px; border-radius: 4px; border: 1px solid #f1f5f9; }
  .tool-control-group { display: flex; align-items: center; gap: 8px; flex: 1; }
  .tool-checkbox { cursor: pointer; width: 14px; height: 14px; margin: 0; }
  .tool-name { font-size: 0.7rem; color: #374151; font-family: monospace; cursor: pointer; user-select: none; }
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
