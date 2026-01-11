<script lang="ts">
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { Workspace } from '$lib/types';
  // import { ask } from '@tauri-apps/plugin-dialog';
  
  // Импорт иконок из ассетов
  import TrashIcon from '$lib/assets/icons/trash.svg?raw';
  import PlusIcon from '$lib/assets/icons/plus.svg?raw';
  import SearchIcon from '$lib/assets/icons/search.svg?raw';
  import MoreIcon from '$lib/assets/icons/more.svg?raw';
  import CheckIcon from '$lib/assets/icons/check.svg?raw';
  import CloseIcon from '$lib/assets/icons/close.svg?raw';
  import EditIcon from '$lib/assets/icons/edit.svg?raw';
  import SettingsIcon from '$lib/assets/icons/settings.svg?raw';
  import ChevronDownIcon from '$lib/assets/icons/chevron-down.svg?raw';
    
  // Используем деструктуризацию пропсов Svelte 5
  let { 
    workspaces, 
    selectedWorkspaceId,
    selectedChatId, 
    chatSearch = $bindable(), 
    searchActive = $bindable(),
    onCreateChat,
    onSelectChat,
    onRenameChat,
    onDeleteChat,
    onCreateWorkspace,
    onSelectWorkspace,
    onOpenSettings
  }: {
    workspaces: Workspace[],
    selectedWorkspaceId: string,
    selectedChatId: string,
    chatSearch: string,
    searchActive: boolean,
    onCreateChat: () => void,
    onSelectChat: (chatId: string, wsId: string) => void,
    onRenameChat: (chatId: string, newName: string) => void,
    onDeleteChat: (chatId: string) => void,
    onCreateWorkspace: () => void,
    onSelectWorkspace: (id: string) => void,
    onOpenSettings: () => void
  } = $props();

  // Состояние для управления контекстным меню и редактированием
  let activeMenuId = $state<string | null>(null);
  let editingChatId = $state<string | null>(null);
  let deletingChatId = $state<string | null>(null);
  let editValue = $state("");
  let isWsOpen = $state(false);

  const currentWs = $derived(workspaces.find((w: Workspace) => w.id === selectedWorkspaceId));

  function handleWsSelect(id: string) {
    onSelectWorkspace(id);
    isWsOpen = false;
  }

  function closeMenus() {
    activeMenuId = null;
    deletingChatId = null;
    isWsOpen = false;
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
  <div class="workspace-selector-container">
    <button 
      class="ws-current" 
      onclick={(e) => { e.stopPropagation(); isWsOpen = !isWsOpen; }}
    >
      <span class="ws-icon-main">{currentWs?.icon || 'W'}</span>
      <span class="ws-name-main">{currentWs?.name || 'Workspace'}</span>
      <span class="chevron" class:rotated={isWsOpen}>{@html ChevronDownIcon}</span>
    </button>

    {#if isWsOpen}
      <div 
        class="ws-dropdown" 
        transition:slide={{ duration: 200 }} 
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (isWsOpen = false)}
        role="menu"
        tabindex="0"
      >
        {#each workspaces as ws}
          <button 
            class="ws-item" 
            class:active={ws.id === selectedWorkspaceId}
            onclick={() => handleWsSelect(ws.id)}
            role="menuitem"
          >
            <span class="ws-icon">{ws.icon}</span>
            <span class="ws-name">{ws.name}</span>
          </button>
        {/each}
        <div class="ws-divider"></div>
        <button 
          class="ws-item add-ws" 
          onclick={() => { onCreateWorkspace(); isWsOpen = false; }}
          role="menuitem"
        >
          <span class="ws-icon-svg">{@html PlusIcon}</span>
          <span>Новое пространство</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="chats-list-header">
    <div class="toolbar">
      <button 
        class="icon" 
        title="Поиск" 
        type="button" 
        onclick={(e) => { e.stopPropagation(); searchActive = !searchActive; }}
      >
        {@html SearchIcon}
      </button>
      
      <button 
        class="icon icon-right" 
        title="Новый чат" 
        type="button" 
        onclick={onCreateChat}
      >
        {@html PlusIcon}
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
    {#if currentWs && currentWs.chats.length > 0}
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
                <button class="confirm-btn" onclick={() => confirmRename(chat.id)} title="Сохранить">
                  {@html CheckIcon}
                </button>
                <button class="cancel-btn" onclick={() => editingChatId = null} title="Отмена">
                  {@html CloseIcon}
                </button>
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
                <button class="cancel-btn" onclick={cancelDelete} title="Отмена">
                  {@html CloseIcon}
                </button>
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
                {@html MoreIcon}
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
                    {@html EditIcon}
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

  <div class="sidebar-footer">
    <button class="footer-btn" onclick={onOpenSettings}>
      <span class="footer-icon">{@html SettingsIcon}</span>
      <span>Настройки</span>
    </button>
  </div>
</aside>

<style>
  .chats-sidebar { 
    width: 260px; 
    flex-shrink: 0; 
    border-right: 1px solid #e5e7eb; 
    display: flex; 
    flex-direction: column; 
    background: #f9fafb; 
    height: 100%;
  }

  /* Виджет воркспейса */
  .workspace-selector-container {
    padding: 12px;
    position: relative;
    border-bottom: 1px solid #f3f4f6;
  }

  .ws-current {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    color: #374151;
    transition: all 0.2s;
  }

  .ws-current:hover {
    border-color: #d1d5db;
    background: #fcfcfc;
  }

  .ws-icon-main {
    font-size: 1.1rem;
    width: 24px;
    text-align: center;
  }

  .ws-name-main {
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    text-align: left;
  }

  .chevron {
    display: flex;
    color: #9ca3af;
    transition: transform 0.2s;
  }

  .chevron.rotated { transform: rotate(180deg); }

  .chevron :global(svg) {
    width: 14px;
    height: 14px;
  }

  .ws-dropdown {
    position: absolute;
    top: calc(100% - 4px);
    left: 12px;
    right: 12px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    z-index: 1000;
    overflow: hidden;
    padding: 4px;
  }

  .ws-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.85rem;
    border-radius: 6px;
    color: #4b5563;
    transition: background 0.2s;
  }

  .ws-item:hover { background: #f3f4f6; }
  .ws-item.active { color: #5865f2; background: #f0f1ff; font-weight: 600; }

  .ws-divider {
    height: 1px;
    background: #f3f4f6;
    margin: 4px 0;
  }

  .add-ws { color: #6b7280; }
  .ws-icon-svg :global(svg) { width: 14px; height: 14px; }
  
  .chats-list-header { 
    padding: 12px 12px 8px 12px; 
  }
  
  .toolbar { 
    display: flex; 
    gap: 4px; 
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

  .icon :global(svg), .context-btn :global(svg) {
    width: 14px;
    height: 14px;
  }

  .chat-search { 
    width: 100%; 
    padding: 6px 10px; 
    border: 1px solid #d1d5db; 
    border-radius: 6px; 
    box-sizing: border-box; 
    font-size: 0.85rem;
    outline: none;
    margin-top: 8px;
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

  .context-btn {
    opacity: 0;
    background: none;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    color: #9ca3af;
    display: flex;
    align-items: center;
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
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: none;
    border: none;
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 4px;
    color: #374151;
  }

  .dropdown-menu button:hover { background: #f3f4f6; }

  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid #f3f4f6;
    background: #f9fafb;
  }

  .footer-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    border-radius: 8px;
    color: #4b5563;
    font-size: 0.9rem;
    transition: background 0.2s;
  }

  .footer-btn:hover { background: #f3f4f6; color: #111827; }

  .footer-icon :global(svg) {
    width: 16px;
    height: 16px;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
  }

  /* Стили для редактирования и удаления (сохранены из оригинала) */
  .edit-mode, .delete-confirm-mode {
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
    border: 1px solid #5865f2;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.8rem;
    outline: none;
    box-sizing: border-box;
  }
</style>