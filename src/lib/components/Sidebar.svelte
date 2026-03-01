<script lang="ts">
  import { tick } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { Workspace } from '$lib/types';
    
  // --- Система локализации ---
  import * as m from '$paraglide/messages';

  // Импорт иконок из ассетов
  import TrashIcon from '$lib/assets/icons/trash.svg?raw';
  import PlusIcon from '$lib/assets/icons/plus.svg?raw';
  import SearchIcon from '$lib/assets/icons/search.svg?raw';
  import MoreIcon from '$lib/assets/icons/more.svg?raw';
  import CheckIcon from '$lib/assets/icons/check.svg?raw';
  import CloseIcon from '$lib/assets/icons/close.svg?raw';
  import EditIcon from '$lib/assets/icons/edit.svg?raw';
  import SettingsIcon from '$lib/assets/icons/settings.svg?raw';
  import InfoIcon from '$lib/assets/icons/info.svg?raw';
    
  // Используем деструктуризацию пропсов Svelte 5
  let { 
    workspaces = $bindable(), 
    currentLocale, // Реактивная руна из +page.svelte
    selectedWorkspaceId,
    selectedChatId, 
    chatSearch = $bindable(), 
    searchActive = $bindable(),
    onCreateChat,
    onSelectChat,
    onRenameChat,
    onDeleteChat,
    onOpenSettings,
    onOpenAbout
  }: {
    workspaces: Workspace[],
    currentLocale: string,
    selectedWorkspaceId: string,
    selectedChatId: string,
    chatSearch: string,
    searchActive: boolean,
    onCreateChat: () => void,
    onSelectChat: (chatId: string, wsId: string) => void,
    onRenameChat: (chatId: string, newName: string) => void,
    onDeleteChat: (chatId: string) => void,
    onOpenSettings: () => void,
    onOpenAbout: () => void
  } = $props();

  // ВКЛЮЧАЕМ РЕАКТИВНОСТЬ
  // Эта переменная будет меняться в +page.svelte. 
  // Используя её в шаблоне рядом с m.функциями, мы заставляем Svelte их перевызывать.
  const _i18n = $derived(currentLocale);

  // Состояние для управления контекстным меню и редактированием
  let activeMenuId = $state<string | null>(null);
  let editingChatId = $state<string | null>(null);
  let deletingChatId = $state<string | null>(null);
  let editValue = $state("");
  
  // Ссылка на элемент инпута поиска
  let searchInputRef = $state<HTMLInputElement | null>(null);

  const currentWs = $derived(workspaces.find((w: Workspace) => w.id === selectedWorkspaceId));

  // Производное состояние для отфильтрованных чатов
  const filteredChats = $derived(
    currentWs ? currentWs.chats.filter(c => 
      c.name.toLocaleLowerCase(currentLocale).includes(chatSearch.toLocaleLowerCase(currentLocale))
    ) : []
  );

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

  // Функция переключения поиска с установкой фокуса
  async function toggleSearch(e: MouseEvent) {
    e.stopPropagation();
    searchActive = !searchActive;
    
    if (searchActive) {
      // Ждем, пока Svelte отрисует инпут в DOM
      await tick();
      searchInputRef?.focus();
    } else {
      chatSearch = ""; // Очищаем поиск при закрытии
    }
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
      <h2 class="sidebar-title">
        {_i18n && m.sidebar_chats_title()}
      </h2>
      
      <div class="actions-group">
        <button 
          class="icon" 
          class:active={searchActive}
          title={_i18n && m.sidebar_search_tooltip()} 
          type="button" 
          onclick={toggleSearch}
        >
          {@html SearchIcon}
        </button>
        
        <button 
          class="icon icon-plus" 
          title={_i18n && m.sidebar_new_chat()} 
          type="button" 
          onclick={onCreateChat}
        >
          {@html PlusIcon}
        </button>
      </div>
    </div>
    
    {#if searchActive}
      <div transition:slide={{ duration: 150 }}>
        <input 
          bind:this={searchInputRef}
          class="chat-search" 
          placeholder={_i18n && m.sidebar_search_placeholder()} 
          bind:value={chatSearch} 
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => {
            if (e.key === 'Escape') searchActive = false;
            e.stopPropagation();
          }}
        />
      </div>
    {/if}
  </div>

  <div class="tree">
    {#each filteredChats as chat (chat.id)}
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
              <button class="confirm-btn" onclick={() => confirmRename(chat.id)} title={_i18n && m.sidebar_tooltip_save()}>
                {@html CheckIcon}
              </button>
              <button class="cancel-btn" onclick={() => editingChatId = null} title={_i18n && m.sidebar_tooltip_cancel()}>
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
            <span class="confirm-label">{_i18n && m.sidebar_delete_confirm()}</span>
            <div class="edit-actions">
              <button class="confirm-delete-btn" onclick={() => confirmDelete(chat.id)} title={_i18n && m.sidebar_menu_delete()}>
                {@html TrashIcon}
              </button>
              <button class="cancel-btn" onclick={cancelDelete} title={_i18n && m.sidebar_tooltip_cancel()}>
                {@html CloseIcon}
              </button>
            </div>
          </div>
        {:else}
          <button 
            type="button"
            class="chat-item" 
            onclick={() => onSelectChat(chat.id, currentWs?.id || "")}
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
                  <span>{_i18n && m.sidebar_menu_rename()}</span>
                  {@html EditIcon}
                </button>
                <button role="menuitem" class="delete-opt" onclick={(e) => { e.stopPropagation(); requestDelete(chat.id); }}>
                  <span>{_i18n && m.sidebar_menu_delete()}</span>
                  {@html TrashIcon}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty-state">
        {chatSearch ? ((_i18n && m.sidebar_no_results?.()) || "No results") : (_i18n && m.sidebar_no_chats())}
      </div>
    {/each}
  </div>

  <div class="sidebar-footer">
    <button class="footer-btn" onclick={onOpenSettings}>
      <span class="footer-icon">{@html SettingsIcon}</span>
      <span>{_i18n && m.sidebar_settings()}</span>
    </button>
    <button class="footer-btn" onclick={onOpenAbout} title="About LLM Zone">
      <span class="footer-icon">{@html InfoIcon}</span>
    </button>
  </div>
</aside>

<style>
  /* Стили без изменений */
  .chats-sidebar { 
    width: 260px; 
    flex-shrink: 0; 
    border-right: 1px solid #e5e7eb; 
    display: flex; 
    flex-direction: column; 
    background: #f9fafb; 
    height: 100%;
  }

  .chats-list-header { 
    padding: 12px 12px 8px 12px; 
    border-bottom: 1px solid #f3f4f6;
  }
  
  .toolbar { 
    display: flex; 
    align-items: center;
    justify-content: space-between;
    gap: 8px; 
    height: 32px;
  }

  .sidebar-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .actions-group {
    display: flex;
    gap: 2px;
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
  
  .icon:hover, .icon.active { 
    background: #e5e7eb; 
    color: #111827;
  }
  
  .icon-plus { 
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

  /* Исправление для системных скроллбаров при открытии настроек */
  :global(body:has(.settings-overlay)) .tree {
    display: none !important;
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
    display: flex;
    gap: 4px;
  }

  .footer-btn {
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
  
  /* Кнопка настроек занимает основное место, кнопка инфо компактная */
  .footer-btn:first-child { flex: 1; }

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

  .edit-mode, .delete-confirm-mode {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px;
    gap: 4px;
    background: #ffffff;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px #e5e7eb;
    box-sizing: border-box;
  }

  .edit-input {
    flex: 1;
    min-width: 0;
    border: 1px solid #5865f2;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85rem;
    outline: none;
    box-sizing: border-box;
    background: #fff;
  }

  .edit-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .confirm-btn, .confirm-delete-btn, .cancel-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .confirm-btn { color: #10b981; }
  .confirm-btn:hover { background: #ecfdf5; }

  .confirm-delete-btn { color: #ef4444; }
  .confirm-delete-btn:hover { background: #fef2f2; }

  .cancel-btn { color: #9ca3af; }
  .cancel-btn:hover { background: #f3f4f6; color: #6b7280; }

  .confirm-btn :global(svg), 
  .confirm-delete-btn :global(svg), 
  .cancel-btn :global(svg) { 
    width: 14px; 
    height: 14px; 
  }

  .confirm-label {
    font-size: 0.8rem;
    color: #ef4444;
    font-weight: 500;
    flex: 1;
    padding-left: 2px;
    white-space: nowrap;
  }

  .danger-zone {
    background: #fff1f1 !important;
  }
</style>
