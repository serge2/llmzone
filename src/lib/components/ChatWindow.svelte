<script lang="ts">
  import type { Message } from '$lib/types';
  import MessageBubble from './MessageBubble.svelte';
  import { tick } from 'svelte';

  export let history: Message[];
  export let isTyping: boolean;
  export let message: string;
  export let onSendMessage: () => void;

  let chatContainer: HTMLElement;

  export async function scrollToBottom() {
    await tick();
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  }
</script>

<section class="chat-column">
  <div class="messages" bind:this={chatContainer}>
    {#each history as msg}
      <MessageBubble text={msg.text} role={msg.role} />
    {/each}
    
    {#if isTyping && (history.length === 0 || history[history.length-1].role !== 'ai')}
      <div class="message-wrapper ai">
        <div class="message typing">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <textarea 
      bind:value={message} 
      on:keydown={handleKeydown} 
      placeholder="Написать ИИ..."
    ></textarea>
    
    <button 
      on:click={onSendMessage} 
      class:stop-btn={isTyping}
      disabled={!isTyping && !message.trim()}
      title={isTyping ? "Остановить генерацию" : "Отправить сообщение"}
    >
      {#if isTyping}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
      {/if}
    </button>
  </div>
</section>

<style>
  .chat-column { flex: 1; display: flex; flex-direction: column; background: #fff; min-width: 0; height: 100%; }
  .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; }
  .input-area { padding: 15px; border-top: 1px solid #eee; display: flex; gap: 10px; background: #fff; flex-shrink: 0; }
  
  textarea { 
    flex: 1; height: 44px; border: 1px solid #ddd; border-radius: 8px; 
    padding: 10px; resize: none; outline: none; font-family: inherit;
  }
  
  .input-area button { 
    width: 44px; height: 44px; background: #007bff; color: white; 
    border: none; border-radius: 8px; cursor: pointer; 
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s ease;
  }
  
  /* Когда кнопка активна для отправки или остановки, курсор - палец */
  .input-area button:not(:disabled) { cursor: pointer; }
  
  /* Стиль кнопки остановки (красный квадрат) */
  .input-area button.stop-btn {
    background: #ef4444; 
  }
  .input-area button.stop-btn:hover {
    background: #dc2626;
  }

  .input-area button:disabled { 
    background: #eee; color: #ccc; cursor: not-allowed; 
  }

  .typing { display: flex; gap: 4px; align-items: center; height: 20px; padding: 10px; }
  .dot { width: 6px; height: 6px; background: #aaa; border-radius: 50%; animation: blink 1.4s infinite; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }
</style>
