<script lang="ts">
  import { tick } from 'svelte';
  import type { Workspace } from '$lib/types';
  // import { ask } from '@tauri-apps/plugin-dialog';
  import TrashIcon from '$lib/assets/icons/trash.svg?raw';
    
  // Используем деструктуризацию пропсов Svelte 5
  let { 
    workspaces, 
    selectedChatId, 
    chatSearch = $bindable(), 
    searchActive = $bindable(),
    onCreateChat,
    onSelectChat,
    onRenameChat,
    onDeleteChat
  }: {
    workspaces: Workspace[],
    selectedChatId: string,
    chatSearch: string,
    searchActive: boolean,
    onCreateChat: () => void,
    onSelectChat: (chatId: string, wsId: string) => void,
    onRenameChat: (chatId: string, newName: string) => void,
    onDeleteChat: (chatId: string) => void
  } = $props();

  // Состояние для управления контекстным меню и редактированием
  let activeMenuId = $state<string | null>(null);
  let editingChatId = $state<string | null>(null);
  let deletingChatId = $state<string | null>(null);
  let editValue = $state("");

  function closeMenus() {
    activeMenuId = null;
    deletingChatId = null;
  }

  function startRename(id: string, currentName: string) {
    editingChatId = id;
    editValue = currentName;
    activeMenuId = null;
  }

  function confirmRename(id: string) {
    if (editValue.trim()) {
      onRenameChat(id, editValue.trim());
    }
    editingChatId = null;
  }

  async function requestDelete(id: string) {
    activeMenuId = null; // Сначала закрываем меню
    await tick();        // Ждем обновления DOM
    deletingChatId = id; // Включаем режим удаления
  }

  function cancelDelete() {
    deletingChatId = null;
  }

  async function confirmDelete(id: string) {
    onDeleteChat(id);
    deletingChatId = null;
  }

  // Action для автоматического фокуса и выделения текста
  function selectOnFocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<svelte:window onclick={closeMenus} />

<aside class="chats-sidebar">
  <div class="chats-list-header">
    <div class="toolbar">
      <button class="icon" title="Опции" type="button">⋯</button>
      <button 
        class="icon" 
        title="Поиск" 
        type="button" 
        onclick={(e) => { e.stopPropagation(); searchActive = !searchActive; }}
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
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      />
    {/if}
  </div>

  <div class="tree">
    {#if workspaces.length > 0}
      {@const currentWs = workspaces[0]}
      {#each currentWs.chats.filter(c => c.name.toLowerCase().includes(chatSearch.toLowerCase())) as chat (chat.id)}
        <div class="chat-item-wrapper" class:selected={chat.id === selectedChatId} class:danger-zone={deletingChatId === chat.id}>
          {#if editingChatId === chat.id}
            <div 
              class="edit-mode" 
              role="presentation"
              onmousedown={(e) => e.stopPropagation()}
            >
              <input 
                class="edit-input"
                use:selectOnFocus
                bind:value={editValue} 
                onkeydown={(e) => {
                  if (e.key === 'Enter') confirmRename(chat.id);
                  if (e.key === 'Escape') editingChatId = null;
                  e.stopPropagation();
                }}
              />
              <div class="edit-actions">
                <button class="confirm-btn" onclick={() => confirmRename(chat.id)} title="Сохранить">✓</button>
                <button class="cancel-btn" onclick={() => editingChatId = null} title="Отмена">✕</button>
              </div>
            </div>
          {:else if deletingChatId === chat.id}
            <div 
              class="delete-confirm-mode" 
              role="presentation"
              onmousedown={(e) => e.stopPropagation()}
            >
              <span class="confirm-label">Удалить?</span>
              <div class="edit-actions">
                <button class="confirm-delete-btn" onclick={() => confirmDelete(chat.id)} title="Удалить">
                  {@html TrashIcon}
                </button>
                <button class="cancel-btn" onclick={cancelDelete} title="Отмена">✕</button>
              </div>
            </div>
          {:else}
            <button 
              type="button"
              class="chat-item" 
              onclick={() => onSelectChat(chat.id, currentWs.id)}
            >
              <span class="chat-name-text">{chat.name}</span>
            </button>

            <div class="menu-anchor">
              <button 
                class="context-btn" 
                onclick={(e) => { e.stopPropagation(); activeMenuId = activeMenuId === chat.id ? null : chat.id; }}
              >
                ⋯
              </button>
              
              {#if activeMenuId === chat.id}
                <div 
                  class="dropdown-menu" 
                  role="menu"
                  tabindex="-1"
                  onmousedown={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.key === 'Escape' && (activeMenuId = null)}
                >
                  <button role="menuitem" onclick={() => startRename(chat.id, chat.name)}>
                    <span>Переименовать</span>
                  </button>
                  <button role="menuitem" class="delete-opt" onclick={(e) => { e.stopPropagation(); requestDelete(chat.id); }}>
                    <span>Удалить</span>
                    {@html TrashIcon}
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
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

  .chat-item-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 8px;
    transition: all 0.2s;
    border: 1px solid transparent;
  }

  .chat-item-wrapper:hover { 
    background: #f3f4f6; 
  }
  
  .chat-item-wrapper.selected { 
    background: #ffffff; 
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  .chat-item-wrapper.danger-zone {
    border-color: #fecaca;
    background: #fef2f2;
  }
  
  .chat-item { 
    background: none; 
    border: none; 
    flex: 1;
    text-align: left; 
    padding: 8px 12px; 
    cursor: pointer; 
    font-size: 0.85rem; 
    display: flex;
    align-items: center;
    color: #4b5563;
    overflow: hidden;
  }
  
  .selected .chat-item { 
    color: #5865f2; 
    font-weight: 600;
  }

  .chat-name-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .menu-anchor {
    display: flex;
    align-items: center;
  }

  .context-btn {
    opacity: 0;
    background: none;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    color: #9ca3af;
    font-size: 1rem;
  }

  .chat-item-wrapper:hover .context-btn {
    opacity: 1;
  }

  .dropdown-menu {
    position: absolute;
    top: 32px;
    right: 8px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 100;
    padding: 4px;
    min-width: 130px;
  }

  .dropdown-menu button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: none;
    border: none;
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 4px;
    color: #374151;
    transition: background 0.2s;
  }

  .dropdown-menu button :global(svg) {
    flex-shrink: 0;
    stroke-width: 2px;
    color: currentColor; 
  }

  .dropdown-menu button:hover {
    background: #f3f4f6;
  }

  .dropdown-menu button.delete-opt {
    color: #ef4444;
  }

  .dropdown-menu button.delete-opt:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .delete-confirm-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 4px 8px;
    gap: 4px;
  }

  .confirm-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #dc2626;
    padding-left: 4px;
  }

  .confirm-delete-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ef4444;
    border: none;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
    padding: 0;
  }

  .confirm-delete-btn:hover {
    background: #dc2626;
  }

  .confirm-delete-btn :global(svg) {
    width: 14px;
    height: 14px;
    stroke: white;
  }

  .edit-mode {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px 6px;
    gap: 4px;
    background: #ffffff;
    border-radius: 6px;
  }

  .edit-input {
    flex: 1;
    min-width: 0;
    border: 1px solid #5865f2;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.8rem;
    outline: none;
    height: 24px;
    box-sizing: border-box;
  }

  .edit-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .confirm-btn, .cancel-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    border-radius: 4px;
    transition: background 0.2s;
    padding: 0;
    line-height: 1;
  }

  .confirm-btn { color: #10b981; }
  .confirm-btn:hover { background: #ecfdf5; }

  .cancel-btn { color: #ef4444; }
  .cancel-btn:hover { background: #fef2f2; }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
  }
</style>
