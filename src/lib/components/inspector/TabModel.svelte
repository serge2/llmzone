<script lang="ts">
  import type { Workspace, GlobalConfig } from '$lib/types';

  let { 
    currentWorkspace = $bindable(), 
    globalConfig,
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace, 
    globalConfig: GlobalConfig,
    onSettingsChange: () => void 
  } = $props();
</script>

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
    <span class="label-text">Название модели</span>
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
    <span class="label-text">Температура: {currentWorkspace.settings.temperature}</span>
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

<style>
  .settings-group { display: flex; flex-direction: column; gap: 16px; }
  .settings-group label { display: flex; flex-direction: column; gap: 6px; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  input {
    width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 0.9rem; font-family: inherit;
  }
  input:focus { outline: none; border-color: #5865f2; box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.1); }
</style>
