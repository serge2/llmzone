<script lang="ts">
  import type { Workspace } from '$lib/types';

  let { 
    currentWorkspace = $bindable(), 
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace, 
    onSettingsChange: () => void 
  } = $props();
</script>

<div class="settings-group">
  <label>
    <span class="label-text">Системный промпт</span>
    <textarea 
      bind:value={currentWorkspace.settings.systemPrompt} 
      onchange={onSettingsChange}
      rows="10" 
      placeholder="Инструкции для модели..."
    ></textarea>
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
</style>
