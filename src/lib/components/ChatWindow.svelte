<script lang="ts">
  import type { Message } from '$lib/types';
  import MessageBubble from './MessageBubble.svelte';
  import { tick } from 'svelte';

  let { 
    history, 
    isTyping, 
    message = $bindable(), 
    onSendMessage,
    onEditMessage,
    onCopyMessage,
    onDeleteMessage,
    onRegenerateMessage
  } = $props<{
    history: Message[];
    isTyping: boolean;
    message: string;
    onSendMessage: () => void;
    onEditMessage: (index: number, newText: string) => void;
    onCopyMessage: (text: string) => void;
    onDeleteMessage: (index: number) => void;
    onRegenerateMessage: () => void;
  }>();

  let chatContainer: HTMLElement;
  let shouldAutoScroll = true;

  export async function scrollToBottom(force = false) {
    await tick();
    if (chatContainer && (shouldAutoScroll || force)) {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: force ? 'auto' : 'smooth'
      });
    }
  }

  function handleScroll() {
    if (!chatContainer) return;
    const threshold = 150;
    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    shouldAutoScroll = distanceFromBottom < threshold;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  }

  $effect(() => {
    if (history.length || isTyping) {
      scrollToBottom();
    }
  });
</script>

<section class="chat-column">
  <div 
    class="messages-container" 
    bind:this={chatContainer} 
    onscroll={handleScroll}
  >
    <div class="messages-list">
      {#each history as msg, index (index)}
        <MessageBubble 
          text={msg.text} 
          role={msg.role}
          isLastMessage={index === history.length - 1}
          onEdit={(newText) => onEditMessage(index, newText)}
          onCopy={() => onCopyMessage(msg.text)}
          onDelete={() => onDeleteMessage(index)}
          onRegenerate={() => onRegenerateMessage()}
        />
      {/each}
      
      {#if isTyping && (history.length === 0 || history[history.length-1].role !== 'ai')}
        <div class="message-wrapper ai">
          <div class="message typing">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="input-container">
    <div class="input-wrapper">
      <textarea 
        bind:value={message} 
        onkeydown={handleKeydown} 
        placeholder="Спросите о чем угодно..."
        rows="1"
      ></textarea>
      
      <button 
        onclick={onSendMessage} 
        class:stop-btn={isTyping}
        disabled={!isTyping && !message.trim()}
      >
        {#if isTyping}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
        {/if}
      </button>
    </div>
    <div class="footer-note">AI может ошибаться. Проверяйте важную информацию.</div>
  </div>
</section>

<style>
  .chat-column { 
    flex: 1; 
    display: flex; 
    flex-direction: column; 
    background: #fdfdfd; 
    height: 100vh;
  }

  .messages-container { 
    flex: 1; 
    overflow-y: auto; 
    padding: 0 10%; /* Отступы для центрирования контента как в ChatGPT */
  }

  .messages-list {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 0;
    display: flex;
    flex-direction: column;
  }

  .input-container { 
    padding: 10px 10% 24px 10%;
    background: linear-gradient(transparent, #fdfdfd 20%);
  }

  .input-wrapper {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    align-items: flex-end;
    gap: 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 10px 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  }
  
  textarea { 
    flex: 1; 
    max-height: 200px;
    min-height: 24px;
    border: none;
    padding: 8px;
    resize: none; 
    outline: none; 
    font-family: inherit; 
    font-size: 1rem;
    background: transparent;
  }
  
  .input-wrapper button { 
    width: 36px; height: 36px; background: #2f2f2f; color: white; border: none; border-radius: 12px; cursor: pointer; 
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.1s;
  }
  .input-wrapper button:hover:not(:disabled) { transform: scale(1.05); background: #000; }
  .input-wrapper button:disabled { background: #e5e7eb; color: #a1a1aa; cursor: not-allowed; }
  .input-wrapper button.stop-btn { background: #ef4444; }

  .footer-note { text-align: center; font-size: 0.7rem; color: #9ca3af; margin-top: 8px; }

  /* Анимация точек печати */
  .typing { display: flex; gap: 4px; padding: 10px 15px !important; background: #f0f0f0 !important; width: fit-content; }
  .dot { width: 4px; height: 4px; background: #888; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out; }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
</style>