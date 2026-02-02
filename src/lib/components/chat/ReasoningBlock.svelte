<script lang="ts">
  import { slide } from 'svelte/transition';
  import * as m from '$paraglide/messages';
  import chevronDownIconRaw from '$lib/assets/icons/chevron-down.svg?raw';

  let {
    reasoning,
    currentLocale,
    index,
    isTyping,
    isLastInGroup,
    hasNoText,
    reasoningExpanded = $bindable()
  }: {
    reasoning: string,
    currentLocale: string,
    index: number,
    isTyping: boolean,
    isLastInGroup: boolean,
    hasNoText: boolean,
    reasoningExpanded: Record<number, boolean>
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ ПЕРЕВОДОВ
  const _i18n = $derived(currentLocale);

  const isExpanded = $derived(reasoningExpanded[index] ?? true);

  function toggleReasoning() {
    reasoningExpanded[index] = !isExpanded;
  }
</script>

<div class="reasoning-container" class:expanded={isExpanded} class:chain-reasoning={index > 0}>
  <button 
    class="reasoning-badge" 
    onclick={toggleReasoning}
  >
    <span class="brain-icon">💭</span>
    <span class="reasoning-preview">
      {#if isExpanded}{_i18n && m.bubble_reasoning_title()}{:else}{reasoning}{/if}
    </span>
    <span class="chevron-icon" class:rotated={isExpanded}>{@html chevronDownIconRaw}</span>
  </button>
  
  {#if isExpanded}
    <div transition:slide={{ duration: 200 }} class="reasoning-content">
      {reasoning}
      {#if isTyping && hasNoText && isLastInGroup}<span class="typing-dot">...</span>{/if}
    </div>
  {/if}
</div>

<style>
  .reasoning-container {
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #f8fafc;
    overflow: hidden;
    max-width: 100%;
  }

  /* Дополнительный отступ для размышлений внутри цепочки */
  .chain-reasoning {
    margin-top: 12px;
  }

  .reasoning-badge {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: #64748b;
    font-size: 0.85rem;
    transition: background-color 0.2s;
  }

  .reasoning-badge:hover {
    background-color: #f1f5f9;
  }

  .reasoning-preview {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-style: italic;
    opacity: 0.7;
  }

  .reasoning-content {
    padding: 12px;
    font-size: 0.8rem;
    color: #15181b;
    background: #fbfbfb;
    border-top: 1px solid #f1f5f9;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .chevron-icon {
    width: 12px;
    height: 12px;
    transition: transform 0.2s;
    opacity: 0.5;
  }

  .chevron-icon.rotated {
    transform: rotate(180deg);
  }

  .typing-dot {
    display: inline-block;
    animation: blink 1.5s infinite;
    margin-left: 2px;
  }

  @keyframes blink {
    0% { opacity: 0.2; }
    50% { opacity: 1; }
    100% { opacity: 0.2; }
  }

  .chevron-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>