<!-- src/lib/components/inspector/TabContext.svelte -->
<script lang="ts">
  import type { Workspace } from '$lib/types';
  import { fade } from 'svelte/transition';

  // Импорт локализации
  import * as m from '$paraglide/messages';

  let { 
    currentWorkspace = $bindable(), 
    currentLocale, // Добавляем проп для локали
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace, 
    currentLocale: string, // Типизация локали
    onSettingsChange: () => void 
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);
</script>

<div class="settings-group">
  <label>
    <span class="label-text">{_i18n && m.tab_context_system_prompt()}</span>
    <textarea 
      bind:value={currentWorkspace.settings.systemPrompt} 
      onchange={onSettingsChange}
      rows="10" 
      placeholder={_i18n && m.tab_context_system_prompt_placeholder()}
    ></textarea>
  </label>

  <label class="checkbox-container">
    <input
      type="checkbox"
      bind:checked={currentWorkspace.settings.followFirstMessage}
      onchange={onSettingsChange}
    />
    <span class="checkbox-text">
      {_i18n && m.tab_context_follow_first_message()}
    </span>
  </label>

  <label class="checkbox-container">
    <input 
      type="checkbox" 
      bind:checked={currentWorkspace.settings.includeMcpInstructions} 
      onchange={onSettingsChange}
    />
    <span class="checkbox-text">
      {_i18n && (m.tab_context_include_mcp_instructions ? m.tab_context_include_mcp_instructions() : "Include MCP instructions in prompt")}
    </span>
  </label>

  <hr class="separator" />

  <label class="checkbox-container">
    <input 
      type="checkbox" 
      bind:checked={currentWorkspace.settings.toolsLoopLimitEnabled} 
      onchange={onSettingsChange}
    />
    <span class="checkbox-text">
      {_i18n && m.tab_context_limit_tools_calls()}
    </span>
  </label>

  {#if currentWorkspace.settings.toolsLoopLimitEnabled}
    <div class="sub-setting" transition:fade={{ duration: 150 }}>
      <label class="input-label">
        <span class="label-text-small">{_i18n && m.tab_context_max_iterations()}</span>
        <input 
          type="number" 
          min="1" 
          max="10000"
          bind:value={currentWorkspace.settings.toolsMaxIterations} 
          onchange={onSettingsChange}
          class="small-number-input"
        />
      </label>
    </div>
  {/if}

  <label class="checkbox-container">
    <input 
      type="checkbox" 
      bind:checked={currentWorkspace.settings.autoRenameEnabled} 
      onchange={onSettingsChange}
    />
    <span class="checkbox-text">
      {_i18n && m.tab_context_auto_name()}
    </span>
  </label>
</div>

<style>
  .settings-group { display: flex; flex-direction: column; gap: 16px; width: 100%; }
  .settings-group label { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  .label-text-small { font-size: 0.7rem; font-weight: 600; color: #6b7280; text-transform: uppercase; }
  
  textarea {
    width: 100%; 
    box-sizing: border-box; /* ГАРАНТИРУЕТ ЧТО PADDING НЕ РАЗДУВАЕТ ШИРИНУ */
    padding: 8px 10px; 
    border: 1px solid #d1d5db;
    border-radius: 6px; 
    font-size: 0.9rem; 
    font-family: inherit; 
    resize: vertical;
  }
  textarea:focus { outline: none; border-color: #5865f2; box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.1); }

  /* Стили для чекбоксов */
  .checkbox-container {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
    cursor: pointer;
    margin-top: -4px;
    width: auto !important; /* Чекбокс не должен тянуться на 100% */
  }
  .checkbox-container input {
    width: 16px;
    height: 16px;
    margin: 0;
    cursor: pointer;
    accent-color: #5865f2;
  }
  .checkbox-text {
    font-size: 0.85rem;
    color: #374151;
    user-select: none;
  }

  /* Стили для новых элементов управления лимитами */
  .separator {
    border: 0;
    border-top: 1px solid #e5e7eb;
    margin: 4px 0;
    width: 100%;
  }

  .sub-setting {
    padding-left: 24px;
    margin-top: -8px;
  }

  .input-label {
    flex-direction: row !important;
    align-items: center;
    gap: 12px !important;
    width: auto !important;
  }

  .small-number-input {
    width: 70px;
    box-sizing: border-box; /* Добавлено */
    padding: 4px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .small-number-input:focus {
    border-color: #5865f2;
  }
</style>
