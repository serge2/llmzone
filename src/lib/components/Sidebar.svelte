<script lang="ts">
  import type { Workspace } from '$lib/types';
  
  // Используем деструктуризацию пропсов Svelte 5
  let { 
    workspaces, 
    selectedChatId, 
    chatSearch = $bindable(), 
    searchActive = $bindable(),
    onCreateChat,
    onSelectChat
  }: {
    workspaces: Workspace[],
    selectedChatId: string,
    chatSearch: string,
    searchActive: boolean,
    onCreateChat: () => void,
    onSelectChat: (chatId: string, wsId: string) => void
  } = $props();
</script>

<aside class="chats-sidebar">
  <div class="chats-list-header">
    <div class="toolbar">
      <button class="icon" title="Опции" type="button">⋯</button>
      <button 
        class="icon" 
        title="Поиск" 
        type="button" 
        onclick={() => searchActive = !searchActive}
      >
        🔍
      </button>
      
      <button 
        class="icon icon-right" 
        title="Новый чат" 
        type="button" 
        onclick={onCreateChat}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
    
    {#if searchActive}
      <input 
        class="chat-search" 
        placeholder="Поиск чата..." 
        bind:value={chatSearch} 
      />
    {/if}
  </div>

  <div class="tree">
    {#if workspaces.length > 0}
      {@const currentWs = workspaces[0]}
      {#each currentWs.chats.filter(c => c.name.toLowerCase().includes(chatSearch.toLowerCase())) as chat (chat.id)}
        <button 
          type="button"
          class="chat-item" 
          class:selected={chat.id === selectedChatId}
          onclick={() => onSelectChat(chat.id, currentWs.id)}
        >
          <span class="chat-icon">💬</span>
          <span class="chat-name-text">{chat.name}</span>
        </button>
      {/each}
    {:else}
      <div class="empty-state">Нет чатов</div>
    {/if}
  </div>
</aside>

<style>
  .chats-sidebar { 
    width: 220px; 
    flex-shrink: 0; 
    border-right: 1px solid #e5e7eb; 
    display: flex; 
    flex-direction: column; 
    background: #f9fafb; 
  }
  
  .chats-list-header { 
    padding: 12px; 
    border-bottom: 1px solid #f3f4f6; 
  }
  
  .toolbar { 
    display: flex; 
    gap: 4px; 
    margin-bottom: 8px; 
  }
  
  .icon { 
    background: none; 
    border: none; 
    padding: 6px; 
    border-radius: 6px; 
    cursor: pointer; 
    color: #6b7280; 
    display: flex; 
    align-items: center; 
    transition: all 0.2s;
  }
  
  .icon:hover { 
    background: #e5e7eb; 
    color: #111827;
  }
  
  .icon-right { 
    margin-left: auto; 
    color: #5865f2; 
    background: rgba(88, 101, 242, 0.05);
  }

  .chat-search { 
    width: 100%; 
    padding: 6px 10px; 
    border: 1px solid #d1d5db; 
    border-radius: 6px; 
    box-sizing: border-box; 
    font-size: 0.85rem;
    outline: none;
  }
  
  .chat-search:focus {
    border-color: #5865f2;
    box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.2); 
    outline: none;
  }

  .tree { 
    flex: 1; 
    overflow-y: auto; 
    padding: 8px; 
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .chat-item { 
    background: none; 
    border: none; 
    width: 100%; 
    text-align: left; 
    padding: 8px 10px; 
    cursor: pointer; 
    border-radius: 8px; 
    font-size: 0.85rem; 
    display: flex;
    align-items: center;
    gap: 10px;
    color: #4b5563;
    transition: all 0.2s;
  }
  
  .chat-item:hover { 
    background: #f3f4f6; 
    color: #111827;
  }
  
  .chat-item.selected { 
    background: #ffffff; 
    color: #5865f2; 
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .chat-icon {
    opacity: 0.5;
    font-size: 1rem;
  }

  .chat-name-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
  }
</style>