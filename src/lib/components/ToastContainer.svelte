<script lang="ts">
  import { toastService } from '$lib/services/toastService.svelte';
  import { flip } from 'svelte/animate';
  import { fade, fly } from 'svelte/transition';
</script>

<div class="toast-container">
  {#each toastService.messages as toast (toast.id)}
    <div 
      class="toast {toast.type}"
      animate:flip={{ duration: 300 }}
      in:fly={{ x: 100, duration: 300 }}
      out:fade
    >
      <span class="icon">
        {#if toast.type === 'error'}⚠️{:else if toast.type === 'success'}✅{:else}ℹ️{/if}
      </span>
      <div class="message">{toast.message}</div>
      <button class="close-btn" onclick={() => toastService.remove(toast.id)}>✕</button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 9999;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    min-width: 280px;
    max-width: 400px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    gap: 12px;
    border-left: 4px solid #ccc;
  }

  .toast.error { border-left-color: #ef4444; background: #fff5f5; color: #991b1b; }
  .toast.success { border-left-color: #10b981; background: #f0fdf4; color: #065f46; }
  .toast.info { border-left-color: #3b82f6; background: #eff6ff; color: #1e40af; }

  .message { font-size: 0.9rem; flex: 1; line-height: 1.4; }
  
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.1rem;
    opacity: 0.5;
    padding: 4px;
  }
  .close-btn:hover { opacity: 1; }
</style>
