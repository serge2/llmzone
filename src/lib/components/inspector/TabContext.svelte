<script lang="ts">
  import type { Workspace } from '$lib/types';

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
</div>

<style>
  .settings-group { display: flex; flex-direction: column; gap: 16px; }
  .settings-group label { display: flex; flex-direction: column; gap: 6px; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  textarea {
    width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 0.9rem; font-family: inherit; resize: vertical;
  }
  textarea:focus { outline: none; border-color: #5865f2; box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.1); }

  /* Стили для нового чекбокса */
  .checkbox-container {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
    cursor: pointer;
    margin-top: -4px;
  }
  .checkbox-container input {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #5865f2;
  }
  .checkbox-text {
    font-size: 0.85rem;
    color: #374151;
    user-select: none;
  }
</style>
