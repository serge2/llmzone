<script lang="ts">
  import type { Workspace } from '$lib/types';
  
  export let workspaces: Workspace[];
  export let selectedChatId: string;
  export let chatSearch: string = '';
  export let searchActive: boolean = false;
  
  export let onCreateWorkspace: () => void;
  export let onCreateChat: () => void;
  export let onSelectChat: (chatId: string, wsId: string) => void;
  export let onToggleWorkspace: (id: string) => void;
  export let collapsedWorkspaces: Record<string, boolean>;
</script>

<aside class="chats-sidebar">
  <div class="chats-list-header">
    <div class="toolbar">
      <button class="icon" title="Опции">⋯</button>
      <button class="icon" title="Поиск" on:click={() => searchActive = !searchActive}>🔍</button>
      <button class="icon" title="Новый воркспейс" on:click={onCreateWorkspace}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M12 10v6m-3-3h6"/>
        </svg>
      </button>
      <button class="icon icon-right" title="Новый чат" on:click={onCreateChat}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
    {#if searchActive}
      <input class="chat-search" placeholder="Поиск..." bind:value={chatSearch} />
    {/if}
  </div>

  <div class="tree">
    {#each workspaces as ws}
      <div class="ws-item">
        <button type="button" class="ws-name" on:click={() => onToggleWorkspace(ws.id)}>
           {collapsedWorkspaces[ws.id] ? '▸' : '▾'} {ws.name}
        </button>
        {#if !collapsedWorkspaces[ws.id]}
          {#each ws.chats.filter(c => c.name.toLowerCase().includes(chatSearch.toLowerCase())) as chat}
            <button 
              type="button"
              class="chat-item" 
              class:selected={chat.id === selectedChatId}
              on:click={() => onSelectChat(chat.id, ws.id)}
            >
              {chat.name}
            </button>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</aside>

<style>
  .chats-sidebar { 
    width: 200px; /* Уменьшили с 240px */
    flex-shrink: 0; /* Чтобы сайдбар не сжимался, если чат будет очень широким */
    border-right: 1px solid #eee; 
    display: flex; 
    flex-direction: column; 
    background: #fbfbfb; 
  }
  .chats-list-header { padding: 10px; border-bottom: 1px solid #eee; }
  .toolbar { display: flex; gap: 4px; margin-bottom: 8px; }
  .icon { background: none; border: none; padding: 6px; border-radius: 4px; cursor: pointer; color: #555; display: flex; align-items: center; }
  .icon:hover { background: #eee; }
  .icon-right { margin-left: auto; color: #007bff; }
  .chat-search { width: 100%; padding: 5px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
  .tree { flex: 1; overflow-y: auto; padding: 10px; }
  .ws-item { margin-bottom: 10px; }
  .ws-name { background: none; border: none; width: 100%; text-align: left; padding: 5px; cursor: pointer; font-weight: bold; color: #444; }
  .chat-item { background: none; border: none; width: 100%; text-align: left; padding: 8px 12px; cursor: pointer; border-radius: 6px; font-size: 0.9rem; margin-top: 2px; }
  .chat-item:hover { background: #f0f0f0; }
  .chat-item.selected { background: #e0e7ff; color: #4338ca; font-weight: 500; }
</style>