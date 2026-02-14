<!-- src/lib/components/inspector/TabModel.svelte -->
<script lang="ts">
  import type { Workspace, GlobalConfig, WorkspaceSettings } from '$lib/types';

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
    // const val = (e.target as HTMLSelectElement).value;
    
    // Автоматическая подстановка URL для популярных сервисов, если поле пустое
    // if (val === 'openrouter' && !currentWorkspace.settings.apiUrl) {
    //   currentWorkspace.settings.apiUrl = 'https://openrouter.ai/api/';
    // } else if (val === 'lm-studio' && (!currentWorkspace.settings.apiUrl {
    //   currentWorkspace.settings.apiUrl = 'http://localhost:1234/';
    // }

    onSettingsChange();
  }

  // Интерфейс для типизации пропсов сниппета
  interface OptionProps {
    min?: number;
    max?: number;
    step?: number;
    default?: number | string;
    placeholder?: string;
    children?: import('svelte').Snippet;
  }
</script>

{#snippet option(
  label: string, 
  key: keyof WorkspaceSettings, 
  enabledKey: keyof WorkspaceSettings, 
  type: 'range' | 'number' | 'select', 
  props: OptionProps = {}
)}
  <div class="option-container" class:disabled={!currentWorkspace.settings[enabledKey]}>
    <div class="option-header">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={currentWorkspace.settings[enabledKey] as boolean} 
          onchange={onSettingsChange} 
        />
        <span class="label-text">
          {label}{#if currentWorkspace.settings[enabledKey] && type === 'range'}: {currentWorkspace.settings[key] ?? props.default}{/if}
        </span>
      </label>
    </div>
    <div class="option-body">
      {#if type === 'range'}
        <input 
          type="range" 
          min={props.min} max={props.max} step={props.step}
          bind:value={currentWorkspace.settings[key] as number} 
          disabled={!currentWorkspace.settings[enabledKey]}
          onchange={onSettingsChange}
        />
      {:else if type === 'number'}
        <input 
          type="number" 
          placeholder={props.placeholder}
          bind:value={currentWorkspace.settings[key] as number} 
          disabled={!currentWorkspace.settings[enabledKey]}
          onchange={onSettingsChange}
        />
      {:else if type === 'select'}
        <select 
          bind:value={currentWorkspace.settings[key]} 
          disabled={!currentWorkspace.settings[enabledKey]}
          onchange={onSettingsChange}
        >
          {#if props.children}
            {@render props.children()}
          {/if}
        </select>
      {/if}
    </div>
  </div>
{/snippet}

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

  {#if currentWorkspace.settings.providerType === 'openrouter'}
    {@render option(m.tab_model_temperature(), 'temperature', 'temperatureEnabled', 'range', { min: 0, max: 2, step: 0.1, default: 1 })}
    {@render option(m.tab_model_top_p(), 'topP', 'topPEnabled', 'range', { min: 0, max: 1, step: 0.05, default: 1 })}
    <div class="grid-params">
      {@render option(m.tab_model_max_completion_tokens(), 'maxCompletionTokens', 'maxCompletionTokensEnabled', 'number', { placeholder: "Auto" })}
      {@render option(m.tab_model_max_tokens(), 'maxTokens', 'maxTokensEnabled', 'number', { placeholder: "Auto" })}
    </div>
    {@render option(m.tab_model_presence_penalty(), 'presencePenalty', 'presencePenaltyEnabled', 'range', { min: -2, max: 2, step: 0.05, default: 0 })}
    {@render option(m.tab_model_frequency_penalty(), 'frequencyPenalty', 'frequencyPenaltyEnabled', 'range', { min: -2, max: 2, step: 0.05, default: 0 })}

    <div class="divider"><span>{_i18n && m.tab_model_strategy()}</span></div>

    {#snippet reasoningEffortOptions()}
      <option value="none">None</option>
      <option value="minimal">Minimal</option>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="xhigh">XHigh</option>
    {/snippet}

    {@render option(m.tab_model_reasoning_effort(), 'reasoningEffort', 'reasoningEffortEnabled', 'select', { children: reasoningEffortOptions })}
    {@render option(m.tab_model_seed(), 'seed', 'seedEnabled', 'number', { placeholder: "None" })}

  {:else if currentWorkspace.settings.providerType === 'openai'}

    {@render option(m.tab_model_temperature(), 'temperature', 'temperatureEnabled', 'range', { min: 0, max: 2, step: 0.1, default: 0.8 })}
    {@render option(m.tab_model_top_p(), 'topP', 'topPEnabled', 'range', { min: 0, max: 1, step: 0.05, default: 0.95 })}
    {@render option(m.tab_model_max_completion_tokens(), 'maxCompletionTokens', 'maxCompletionTokensEnabled', 'number', { placeholder: "Auto" })}
    {@render option(m.tab_model_presence_penalty(), 'presencePenalty', 'presencePenaltyEnabled', 'range', { min: -2, max: 2, step: 0.05, default: 0 })}
    {@render option(m.tab_model_frequency_penalty(), 'frequencyPenalty', 'frequencyPenaltyEnabled', 'range', { min: -2, max: 2, step: 0.05, default: 0 })}

    <div class="divider"><span>{_i18n && m.tab_model_strategy()}</span></div>

    {#snippet reasoningEffortOptions()}
      <option value="none">None</option>
      <option value="minimal">Minimal</option>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="xhigh">XHigh</option>
    {/snippet}
    {@render option(m.tab_model_reasoning_effort(), 'reasoningEffort', 'reasoningEffortEnabled', 'select', { children: reasoningEffortOptions })}

    {#snippet verbosityOptions()}
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    {/snippet}
    {@render option(m.tab_model_verbosity(), 'verbosity', 'verbosityEnabled', 'select', { children: verbosityOptions })}
    {@render option(m.tab_model_seed(), 'seed', 'seedEnabled', 'number', { placeholder: "None" })}


  {:else if currentWorkspace.settings.providerType === 'lm-studio'}

    {@render option(m.tab_model_temperature(), 'temperature', 'temperatureEnabled', 'range', { min: 0, max: 1, step: 0.05, default: 0.8 })}
    {@render option(m.tab_model_top_p(), 'topP', 'topPEnabled', 'range', { min: 0, max: 1, step: 0.05, default: 0.95 })}
    {@render option(m.tab_model_top_k(), 'topK', 'topKEnabled', 'range', { min: 0, max: 100, step: 1, default: 40 })}
    {@render option(m.tab_model_min_p(), 'minP', 'minPEnabled', 'range', { min: 0, max: 1, step: 0.01, default: 0.05 })}
    {@render option(m.tab_model_repeat_penalty(), 'repeatPenalty', 'repeatPenaltyEnabled', 'range', { min: 1, max: 2, step: 0.05, default: 1.1 })}
    {@render option(m.tab_model_max_completion_tokens(), 'maxCompletionTokens', 'maxCompletionTokensEnabled', 'number', { placeholder: "Auto" })}

    <div class="divider"><span>{_i18n && m.tab_model_strategy()}</span></div>
    
    {#snippet reasoningOptions()}
      <option value="off">Off</option>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="on">On</option>
    {/snippet}
    {@render option(m.tab_model_reasoning_effort(), 'reasoning', 'reasoningEnabled', 'select', { children: reasoningOptions })}
    {@render option(m.tab_model_context_length(), 'contextLength', 'contextLengthEnabled', 'number', { placeholder: "Auto" })}

  {/if}
</div>

<style>
  .settings-group { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .settings-group label { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .label-text { font-size: 0.7rem; font-weight: 700; color: #4b5563;/* text-transform: uppercase;*/ }
  
  input, select {
    width: 100%; 
    box-sizing: border-box; /* ГАРАНТИРУЕТ ЧТО PADDING НЕ РАЗДУВАЕТ ШИРИНУ */
    padding: 4px 10px; 
    border: 1px solid #d1d5db;
    border-radius: 6px; 
    font-size: 0.7rem; 
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

  input:disabled, select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: #f3f4f6;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 8px 0 -4px 0;
  }

  .divider span {
    font-size: 0.7rem;
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

  .option-container {
    display: flex;
    flex-direction: column;
    gap: 2px;
    transition: opacity 0.2s;
  }

  .option-container.disabled {
    opacity: 0.6;
  }

  .checkbox-label {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: 14px;
    height: 14px;
    margin: 0;
    padding: 0;
    cursor: pointer;
  }

  .option-body {
    width: 100%;
  }
</style>
