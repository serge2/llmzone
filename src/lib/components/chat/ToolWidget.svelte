<!-- ToolWidget.svelte -->
<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Message, ToolCall } from '$lib/types';
  import * as m from '$paraglide/messages';
  import chevronDownIconRaw from '$lib/assets/icons/chevron-down.svg?raw';

  let {
    call,
    result,
    currentLocale,
    expandedTools = $bindable(),
    onApproveTool
  }: {
    call: ToolCall,
    result: Message | undefined,
    currentLocale: string,
    expandedTools: Record<string, boolean>,
    onApproveTool?: (callId: string, status: 'approved' | 'rejected') => void
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  // Параметры состояния инструмента
  const isError = $derived(result?.tool_result?.isError);
  const isPending = $derived(call.approvalStatus === 'pending');
  const isRejected = $derived(call.approvalStatus === 'rejected');
  const isOpen = $derived(expandedTools[call.id] ?? isPending);

  function toggleTool(e: MouseEvent) {
    e.preventDefault();
    expandedTools[call.id] = !isOpen;
  }
</script>

<div class="tool-widget" class:needs-approval={isPending} class:is-rejected={isRejected}>
  <details class="main-details" open={isOpen}>
    <summary 
      class="tool-summary" 
      class:success={!!result && !isError} 
      class:error={isError || isRejected} 
      class:pending={isPending}
      onclick={toggleTool}
    >
      <span class="icon">{isPending ? '❓' : '🛠'}</span>
      <span class="name">
        {#if isPending}
          {_i18n && m.bubble_tool_approval_request()}
        {:else if isRejected}
          {_i18n && m.bubble_tool_rejected_label()}
        {:else}
          {_i18n && m.bubble_tool_label()}
        {/if} 
        
        <span class="tool-name-container">
          {#if call.server_name}
            <span class="server-prefix">{call.server_name}:</span><strong class="tool-accent">{call.tool_name}</strong>
          {:else}
            <strong class="tool-accent">{call.tool_name}</strong>
          {/if}
        </span>
      </span>
      <span class="status-icon" class:rotated={isOpen}>{@html chevronDownIconRaw}</span>
    </summary>
    
    <div class="tool-details-content">
      <details class="sub-details" open={true}>
        <summary class="sub-summary">
          <span>{_i18n && m.bubble_tool_args()}</span>
          <span class="sub-status-icon">{@html chevronDownIconRaw}</span>
        </summary>
        
        {#key (call.raw_arguments || JSON.stringify(call.arguments))}
          <pre class="language-json"><code>{
            (call.arguments && Object.keys(call.arguments).length > 0) 
              ? JSON.stringify(call.arguments, null, 2) 
              : (call.raw_arguments || "{}")
          }</code></pre>
        {/key}
      </details>

      {#if isPending}
        <div class="approval-actions" transition:slide>
          <p class="approval-hint">{_i18n && m.bubble_tool_approval_hint()}</p>
          <div class="approval-buttons">
            <button class="approve-btn" onclick={() => onApproveTool?.(call.id, 'approved')}>
              {_i18n && m.bubble_tool_allow()}
            </button>
            <button class="reject-btn" onclick={() => onApproveTool?.(call.id, 'rejected')}>
              {_i18n && m.bubble_tool_deny()}
            </button>
          </div>
        </div>
      {:else if isRejected}
        <div class="tool-rejected-note">
           {_i18n && m.bubble_tool_rejected_note()}
        </div>
      {:else}
        <details class="sub-details">
          <summary class="sub-summary">
            <span>{_i18n && m.bubble_tool_response()}</span>
            <span class="sub-status-icon">{@html chevronDownIconRaw}</span>
          </summary>
          {#if result}
            <pre class="language-json"><code>{result.tool_result?.content || ''}</code></pre>
          {:else}
            <div class="tool-loading">{_i18n && m.bubble_tool_executing()}</div>
          {/if}
        </details>
      {/if}
    </div>
  </details>
</div>

<style>
  .tool-widget {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    overflow: hidden;
    transition: all 0.2s;
  }

  .tool-widget.needs-approval {
    border-color: #f59e0b;
    box-shadow: 0 0 0 1px #fef3c7;
  }

  .tool-widget.is-rejected {
    border-color: #fca5a5;
    opacity: 0.8;
  }

  .tool-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    list-style: none;
    font-size: 0.85rem;
    color: #475569;
    user-select: none;
  }

  /* Стили для разделения Сервера и Инструмента */
  .tool-name-container {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
  }

  .server-prefix {
    opacity: 0.6;
    font-weight: 400;
    font-size: 0.8rem;
  }

  .tool-accent {
    color: #2563eb; /* Акцентный синий для самого инструмента */
  }

  .success .tool-accent { color: #166534; }
  .error .tool-accent { color: #991b1b; }
  .pending .tool-accent { color: #92400e; }

  .tool-summary.success {
    background-color: #f0fdf4;
    color: #166534;
    border-bottom: 1px solid #dcfce7;
  }

  .tool-summary.error {
    background-color: #fef2f2;
    color: #991b1b;
    border-bottom: 1px solid #fee2e2;
  }

  .tool-summary.pending {
    background-color: #fffbeb;
    color: #92400e;
    border-bottom: 1px solid #fef3c7;
  }
  
  .tool-summary::-webkit-details-marker { display: none; }

  .tool-summary .status-icon {
    margin-left: auto;
    width: 14px;
    height: 14px;
    transition: transform 0.2s;
    color: currentColor;
    opacity: 0.5;
    display: flex;
    align-items: center;
  }

  .status-icon.rotated {
    transform: rotate(180deg);
  }

  .tool-details-content {
    padding: 0 10px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #f1f5f9;
    background: #ffffff;
  }

  .sub-details {
    border: 1px solid #f1f5f9;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
  }

  .sub-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    background: #fcfdfe;
    list-style: none;
  }
  .sub-summary::-webkit-details-marker { display: none; }

  .sub-status-icon {
    width: 12px;
    height: 12px;
    transition: transform 0.2s;
    color: #cbd5e1;
    display: flex;
    align-items: center;
  }

  .sub-details[open] .sub-status-icon {
    transform: rotate(180deg);
  }

  pre {
    margin: 0 !important;
    padding: 12px !important;
    font-size: 0.8rem !important;
    background: #fafafa !important;
    color: #334155 !important;
    border-radius: 0;
    max-height: 400px;
    overflow-y: auto;
    border-top: 1px solid #f1f5f9;
  }

  .approval-actions {
    padding: 12px;
    background: #fffbeb;
    border-radius: 8px;
    margin-top: 4px;
    border: 1px dashed #fcd34d;
  }

  .approval-hint {
    font-size: 0.75rem;
    color: #92400e;
    margin-bottom: 10px !important;
    font-weight: 500;
  }

  .approval-buttons {
    display: flex;
    gap: 8px;
  }

  .approve-btn, .reject-btn {
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }

  .approve-btn { background: #059669; color: white; }
  .approve-btn:hover { background: #047857; }
  
  .reject-btn { background: #dc2626; color: white; }
  .reject-btn:hover { background: #b91c1c; }

  .tool-rejected-note {
    padding: 12px;
    font-size: 0.8rem;
    color: #b91c1c;
    font-style: italic;
    background: #fef2f2;
    border-radius: 8px;
    margin-top: 4px;
  }

  .tool-loading {
    padding: 10px;
    font-size: 0.75rem;
    color: #94a3b8;
    font-style: italic;
    text-align: center;
  }

  .status-icon :global(svg), .sub-status-icon :global(svg) { 
    width: 100%; 
    height: 100%; 
  }
</style>
