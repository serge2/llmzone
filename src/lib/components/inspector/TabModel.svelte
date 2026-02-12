<script lang="ts">
  import type { Workspace, GlobalConfig } from '$lib/types';

  // Импорт локализации
  import * as m from '$paraglide/messages';

  let { 
    currentWorkspace = $bindable(), 
    globalConfig,
    currentLocale, // Добавляем проп для локали
    onSettingsChange 
  }: { 
    currentWorkspace: Workspace, 
    globalConfig: GlobalConfig,
    currentLocale: string, // Типизация локали
    onSettingsChange: () => void 
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  // Список доступных провайдеров с поддержкой локализации
  const providers = $derived([
    { id: 'openai', name: m.tab_model_provider_openai() },
    { id: 'lm-studio', name: m.tab_model_provider_lm_studio() },
    { id: 'openrouter', name: m.tab_model_provider_openrouter() },
    // { id: 'anthropic', name: m.tab_model_provider_anthropic() },
    // { id: 'custom', name: m.tab_model_provider_custom() },
  ]);

  // Логика быстрой настройки при смене провайдера
  function handleProviderChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    
    // Автоматическая подстановка URL для популярных сервисов, если поле пустое
    // if (val === 'openrouter' && !currentWorkspace.settings.apiUrl) {
    //   currentWorkspace.settings.apiUrl = 'https://openrouter.ai/api/';
    // } else if (val === 'lm-studio' && (!currentWorkspace.settings.apiUrl {
    //   currentWorkspace.settings.apiUrl = 'http://localhost:1234/';
    // }
    
    onSettingsChange();
  }
</script>

<div class="settings-group">
  <label>
    <span class="label-text">{_i18n && m.tab_model_provider_type()}</span>
    <select 
      bind:value={currentWorkspace.settings.providerType} 
      onchange={handleProviderChange}
    >
      {#each providers as provider}
        <option value={provider.id}>{provider.name}</option>
      {/each}
    </select>
  </label>

  <label>
    <span class="label-text">{_i18n && m.tab_model_api_url()}</span>
    <input 
      bind:value={currentWorkspace.settings.apiUrl} 
      onchange={onSettingsChange}
      placeholder={globalConfig.apiUrl} 
    />
  </label>
  <label>
    <span class="label-text">{_i18n && m.tab_model_name()}</span>
    <input 
      bind:value={currentWorkspace.settings.modelName} 
      onchange={onSettingsChange}
      placeholder={globalConfig.modelName} 
    />
  </label>
  <label>
    <span class="label-text">{_i18n && m.tab_model_api_key()}</span>
    <input 
      type="password"
      bind:value={currentWorkspace.settings.apiKey} 
      onchange={onSettingsChange}
      placeholder={globalConfig.apiKey ? "••••••••" : (_i18n && m.tab_model_api_key_not_set())} 
    />
  </label>

  <div class="divider"><span>{_i18n && m.tab_model_sampling_limits()}</span></div>

  <label>
    <span class="label-text">{_i18n && m.tab_model_temperature()}: {currentWorkspace.settings.temperature}</span>
    <input 
      type="range" 
      min="0" 
      max="2" 
      step="0.1" 
      bind:value={currentWorkspace.settings.temperature} 
      onchange={onSettingsChange}
    />
  </label>

  <div class="grid-params">
    <label>
      <span class="label-text">{_i18n && m.tab_model_max_tokens()}</span>
      <input 
        type="number" 
        placeholder="Auto"
        bind:value={currentWorkspace.settings.maxCompletionTokens} 
        onchange={onSettingsChange}
      />
    </label>
    <label>
      <span class="label-text">{_i18n && m.tab_model_top_p()}: {currentWorkspace.settings.topP ?? 1}</span>
      <input 
        type="range" min="0" max="1" step="0.05"
        bind:value={currentWorkspace.settings.topP} 
        onchange={onSettingsChange}
      />
    </label>
  </div>

  <div class="divider"><span>{_i18n && m.tab_model_strategy()}</span></div>

  {#if currentWorkspace.settings.providerType === 'lm-studio'}
    <label>
      <span class="label-text">{_i18n && m.tab_model_reasoning_mode()} (LM Studio)</span>
      <select bind:value={currentWorkspace.settings.reasoning} onchange={onSettingsChange}>
        <option value={undefined}>Auto</option>
        <option value="off">Off</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="on">On</option>
      </select>
    </label>

    <label>
      <span class="label-text">{_i18n && m.tab_model_context_length()}</span>
      <input type="number" placeholder="Default" bind:value={currentWorkspace.settings.contextLength} onchange={onSettingsChange} />
    </label>

    <div class="grid-params">
      <label>
        <span class="label-text">{_i18n && m.tab_model_min_p()}: {currentWorkspace.settings.minP ?? 0.05}</span>
        <input type="range" min="0" max="1" step="0.01" bind:value={currentWorkspace.settings.minP} onchange={onSettingsChange} />
      </label>
      <label>
        <span class="label-text">{_i18n && m.tab_model_repeat_penalty()}: {currentWorkspace.settings.repeatPenalty ?? 1.1}</span>
        <input type="range" min="1" max="2" step="0.05" bind:value={currentWorkspace.settings.repeatPenalty} onchange={onSettingsChange} />
      </label>
    </div>
  {:else}
    <label>
      <span class="label-text">{_i18n && m.tab_model_reasoning_effort()}</span>
      <select bind:value={currentWorkspace.settings.reasoningEffort} onchange={onSettingsChange}>
        <option value={undefined}>Default</option>
        <option value="none">None</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </label>
  {/if}

  <label>
    <span class="label-text">{_i18n && m.tab_model_seed()}</span>
    <input 
      type="number" 
      placeholder="None"
      bind:value={currentWorkspace.settings.seed} 
      onchange={onSettingsChange}
    />
  </label>
</div>

<style>
  .settings-group { display: flex; flex-direction: column; gap: 16px; width: 100%; }
  .settings-group label { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .label-text { font-size: 0.75rem; font-weight: 700; color: #4b5563; text-transform: uppercase; }
  
  input, select {
    width: 100%; 
    box-sizing: border-box; /* ГАРАНТИРУЕТ ЧТО PADDING НЕ РАЗДУВАЕТ ШИРИНУ */
    padding: 8px 10px; 
    border: 1px solid #d1d5db;
    border-radius: 6px; 
    font-size: 0.9rem; 
    font-family: inherit;
    background-color: white;
  }
  
  input:focus, select:focus { 
    outline: none; 
    border-color: #5865f2; 
    box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.1); 
  }
  
  /* Исправляем ширину слайдера, чтобы он не прыгал */
  input[type="range"] {
    padding: 0;
    cursor: pointer;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 8px 0 -4px 0;
  }

  .divider span {
    font-size: 0.65rem;
    font-weight: 800;
    color: #9ca3af;
    text-transform: uppercase;
    white-space: nowrap;
    margin-right: 10px;
  }

  .divider::after {
    content: "";
    height: 1px;
    width: 100%;
    background-color: #e5e7eb;
  }

  .grid-params {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
</style>
