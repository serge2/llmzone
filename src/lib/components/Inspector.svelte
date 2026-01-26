<script lang="ts">
  import type { Workspace, GlobalConfig, InspectorTab } from '$lib/types';
  import TabModel from './inspector/TabModel.svelte';
  import TabContext from './inspector/TabContext.svelte';
  import TabTools from './inspector/TabTools.svelte';
  import type { MCPServerInstance } from '$lib/mcp/manager.svelte'; // Импорт типа инстанса

  // Импорт локализации
  import * as m from '$paraglide/messages';

  // Импорт иконок из ассетов
  import MessageIcon from '$lib/assets/icons/message.svg?raw';
  import CpuIcon from '$lib/assets/icons/cpu.svg?raw';
  import ToolsIcon from '$lib/assets/icons/tools.svg?raw';
  
  let { 
    currentWorkspace = $bindable(), 
    globalConfig,
    serverInstances = $bindable(), // Добавляем bindable проп для серверов
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace | undefined, 
    globalConfig: GlobalConfig,
    serverInstances: MCPServerInstance[], // Типизация массива инстансов
    onSettingsChange: () => void 
  } = $props();

  // Производное состояние: берем вкладку из настроек воркспейса или 'model' по умолчанию
  const inspectorTab = $derived(currentWorkspace?.settings.lastActiveTab || 'model');

  // Функция переключения вкладок с сохранением в конфиг
  function setTab(tab: InspectorTab) {
    if (currentWorkspace) {
      currentWorkspace.settings.lastActiveTab = tab;
      onSettingsChange();
    }
  }
</script>

<aside class="inspector">
  <div class="tabs">
    <button class:active={inspectorTab === 'model'} onclick={() => setTab('model')}>
      {@html CpuIcon}
      {m.inspector_tab_model()}
    </button>
    <button class:active={inspectorTab === 'context'} onclick={() => setTab('context')}>
      {@html MessageIcon}
      {m.inspector_tab_context()}
    </button>
    <button class:active={inspectorTab === 'tools'} onclick={() => setTab('tools')}>
      {@html ToolsIcon}
      {m.inspector_tab_tools()}
    </button>
  </div>

  <div class="content">
    {#if currentWorkspace}
      {#if inspectorTab === 'model'}
        <TabModel bind:currentWorkspace={currentWorkspace} {globalConfig} {onSettingsChange} />
      {:else if inspectorTab === 'context'}
        <TabContext bind:currentWorkspace={currentWorkspace} {onSettingsChange} />
      {:else if inspectorTab === 'tools'}
        <TabTools 
          bind:currentWorkspace={currentWorkspace} 
          bind:serverInstances={serverInstances} 
          {onSettingsChange} 
        />
      {/if}
    {:else}
      <p class="empty-text">{m.inspector_empty_state()}</p>
    {/if}
  </div>
</aside>

<style>
  .inspector {
    width: 380px;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    flex-shrink: 0;
    position: relative;
    z-index: 10;
  }
  .tabs { display: flex; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
  .tabs button {
    flex: 1; padding: 10px 4px; font-size: 0.7rem; font-weight: 600;
    text-transform: uppercase; border: none; background: none; cursor: pointer;
    color: #6b7280; border-bottom: 2px solid transparent;
    display: flex; align-items: center; justify-content: center; gap: 6px; /* Стили для выравнивания иконки и текста */
  }
  .tabs button.active { color: #5865f2; border-bottom-color: #5865f2; background: #ffffff; }

  /* Стилизация иконок в табах */
  .tabs button :global(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 2px;
  }

  .content { padding: 16px; overflow-y: auto; flex: 1; }
  .empty-text { color: #9ca3af; text-align: center; margin-top: 20px; font-size: 0.9rem; }
</style>
