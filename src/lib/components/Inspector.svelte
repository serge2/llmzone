<script lang="ts">
  import type { Workspace, GlobalConfig } from '$lib/types';

  // Импорт иконок из ассетов
  import MessageIcon from '$lib/assets/icons/message.svg?raw';
  import CpuIcon from '$lib/assets/icons/cpu.svg?raw';
  import ToolsIcon from '$lib/assets/icons/tools.svg?raw';
  
  let { 
    currentWorkspace, 
    globalConfig,
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace | undefined, 
    globalConfig: GlobalConfig,
    onSettingsChange: () => void 
  } = $props();

  let inspectorTab = $state<'context' | 'model' | 'tools'>('model');
</script>

<aside class="inspector">
  <div class="tabs">
    <button class:active={inspectorTab === 'context'} onclick={() => inspectorTab = 'context'}>
      {@html MessageIcon}
      Context
    </button>
    <button class:active={inspectorTab === 'model'} onclick={() => inspectorTab = 'model'}>
      {@html CpuIcon}
      Model
    </button>
    <button class:active={inspectorTab === 'tools'} onclick={() => inspectorTab = 'tools'}>
      {@html ToolsIcon}
      Tools
    </button>
  </div>

  <div class="content">
    {#if currentWorkspace}
      {#if inspectorTab === 'context'}
        <div class="settings-group">
          <label>
            <span class="label-text">System Prompt</span>
            <textarea 
              bind:value={currentWorkspace.settings.systemPrompt} 
              onchange={onSettingsChange}
              rows="10" 
              placeholder="Инструкции для модели..."
            ></textarea>
          </label>
        </div>
      {:else if inspectorTab === 'model'}
        <div class="settings-group">
          <label>
            <span class="label-text">API URL</span>
            <input 
              bind:value={currentWorkspace.settings.apiUrl} 
              onchange={onSettingsChange}
              placeholder={globalConfig.apiUrl} 
            />
          </label>
          <label>
            <span class="label-text">Model Name</span>
            <input 
              bind:value={currentWorkspace.settings.modelName} 
              onchange={onSettingsChange}
              placeholder={globalConfig.modelName} 
            />
          </label>
          <label>
            <span class="label-text">API Key</span>
            <input 
              type="password"
              bind:value={currentWorkspace.settings.apiKey} 
              onchange={onSettingsChange}
              placeholder={globalConfig.apiKey ? "••••••••" : "Ключ не задан"} 
            />
          </label>
          <label>
            <span class="label-text">Temperature: {currentWorkspace.settings.temperature}</span>
            <input 
              type="range" 
              min="0" 
              max="2" 
              step="0.1" 
              bind:value={currentWorkspace.settings.temperature} 
              onchange={onSettingsChange}
            />
          </label>
        </div>
      {:else if inspectorTab === 'tools'}
        <div class="settings-group">
          <span class="label-text">Интеграции и инструменты</span>
          <p class="info-text">Здесь скоро появятся настройки функций (Tools/Function Calling).</p>
        </div>
      {/if}
    {:else}
      <p class="empty-text">Выберите воркспейс для настройки</p>
    {/if}
  </div>
</aside>

<style>
  .inspector {
    width: 280px;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    flex-shrink: 0;
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
  .settings-group { display: flex; flex-direction: column; gap: 16px; }
  .settings-group label { display: flex; flex-direction: column; gap: 6px; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  .info-text { font-size: 0.85rem; color: #6b7280; }
  .empty-text { color: #9ca3af; text-align: center; margin-top: 20px; font-size: 0.9rem; }
  input, textarea {
    width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 0.9rem; font-family: inherit;
  }
  input:focus, textarea:focus { outline: none; border-color: #5865f2; box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.1); }
</style>
