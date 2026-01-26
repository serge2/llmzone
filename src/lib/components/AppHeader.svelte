<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Workspace } from '$lib/types';
  import WorkspaceIconPicker from './WorkspaceIconPicker.svelte';
  import { tick } from 'svelte';
  import { setLocale, getLocale } from '$paraglide/runtime';
  import * as m from '$paraglide/messages';

  // Иконки
  import MenuIcon from '$lib/assets/icons/menu.svg?raw';
  import ChevronDownIcon from '$lib/assets/icons/chevron-down.svg?raw';
  import PlusIcon from '$lib/assets/icons/plus.svg?raw';
  import EditIcon from '$lib/assets/icons/edit.svg?raw';
  import TrashIcon from '$lib/assets/icons/trash.svg?raw';
  import CheckIcon from '$lib/assets/icons/check.svg?raw';
  import CloseIcon from '$lib/assets/icons/close.svg?raw';

  let {
    workspaces = $bindable(),
    selectedWorkspaceId,
    currentChatName,
    sidebarVisible = $bindable(),
    onSelectWorkspace,
    onCreateWorkspace,
    onRenameWorkspace,
    onDeleteWorkspace
  }: {
    workspaces: Workspace[],
    selectedWorkspaceId: string,
    currentChatName: string,
    sidebarVisible: boolean,
    onSelectWorkspace: (id: string) => void,
    onCreateWorkspace: () => void,
    onRenameWorkspace: (id: string, name: string) => void,
    onDeleteWorkspace: (id: string) => void
  } = $props();

  let isWsOpen = $state(false);
  let editingWsId = $state<string | null>(null);
  let wsEditValue = $state("");

  const currentWs = $derived(workspaces.find(w => w.id === selectedWorkspaceId));

  function handleWsSelect(id: string) {
    if (editingWsId) return;
    onSelectWorkspace(id);
    isWsOpen = false;
  }

  function startRenameWs(e: MouseEvent, id: string, name: string) {
    e.stopPropagation();
    editingWsId = id;
    wsEditValue = name;
  }

  function confirmRenameWs(id: string) {
    if (wsEditValue.trim()) {
      onRenameWorkspace(id, wsEditValue.trim());
    }
    editingWsId = null;
  }

  function selectOnFocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function closeDropdown() {
    isWsOpen = false;
    editingWsId = null;
  }
</script>

<svelte:window onclick={closeDropdown} />

<header class="app-header">
  <button 
    class="sidebar-toggle" 
    onclick={(e) => { e.stopPropagation(); sidebarVisible = !sidebarVisible; }} 
    aria-label={m.sidebar_toggle_aria()}
  >
    {@html MenuIcon}
  </button>

  <div class="workspace-selector">
    <button 
      class="ws-trigger" 
      onclick={(e) => { e.stopPropagation(); isWsOpen = !isWsOpen; }}
      aria-expanded={isWsOpen}
      aria-haspopup="listbox"
    >
      <span class="ws-icon-current">{currentWs?.icon || '📁'}</span>
      <span class="ws-name-current">{currentWs?.name || m.workspace_new_name()}</span>
      <span class="chevron" class:rotated={isWsOpen}>{@html ChevronDownIcon}</span>
    </button>

    {#if isWsOpen}
      <div 
        class="ws-dropdown" 
        transition:slide={{ duration: 150 }} 
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && closeDropdown()}
        role="presentation"
      >
        <ul class="ws-list" role="listbox">
          {#each workspaces as ws (ws.id)}
            <li 
              class="ws-item-container" 
              class:active={ws.id === selectedWorkspaceId}
            >
              {#if editingWsId === ws.id}
                <div class="ws-edit-row">
                  <WorkspaceIconPicker 
                    bind:value={ws.icon} 
                    onSelect={(newIcon) => ws.icon = newIcon} 
                  />
                  <input 
                    class="ws-input"
                    use:selectOnFocus
                    bind:value={wsEditValue}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') confirmRenameWs(ws.id);
                      if (e.key === 'Escape') editingWsId = null;
                    }}
                  />
                  <button class="icon-btn save" onclick={() => confirmRenameWs(ws.id)}>
                    {@html CheckIcon}
                  </button>
                </div>
              {:else}
                <button 
                  class="ws-item-btn" 
                  role="option"
                  aria-selected={ws.id === selectedWorkspaceId}
                  onclick={() => handleWsSelect(ws.id)}
                >
                  <span class="ws-icon">{ws.icon}</span>
                  <span class="ws-name">{ws.name}</span>
                </button>
                <div class="ws-item-actions">
                  <button class="icon-btn" onclick={(e) => startRenameWs(e, ws.id, ws.name)}>
                    {@html EditIcon}
                  </button>
                  {#if workspaces.length > 1}
                    <button class="icon-btn del" onclick={() => onDeleteWorkspace(ws.id)}>
                      {@html TrashIcon}
                    </button>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        
        <div class="ws-footer">
          <button class="add-ws-btn" onclick={onCreateWorkspace}>
            {@html PlusIcon}
            <span>{m.workspace_add_button()}</span>
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="chat-breadcrumb">
    <span class="sep">/</span>
    <span class="chat-name">{currentChatName}</span>
  </div>
</header>

<style>
  .app-header {
    height: 48px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 8px;
    background: #fff;
    z-index: 100;
  }

  .sidebar-toggle {
    background: none;
    border: none;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    color: #6b7280;
    display: flex;
  }

  .sidebar-toggle:hover { background: #f3f4f6; }
  .sidebar-toggle :global(svg) { width: 20px; height: 20px; }

  .workspace-selector {
    position: relative;
  }

  .ws-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border: 1px solid transparent;
    background: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    color: #111827;
    transition: all 0.2s;
  }

  .ws-trigger:hover {
    background: #f3f4f6;
    border-color: #e5e7eb;
  }

  .ws-icon-current { font-size: 1.1rem; }
  .ws-name-current { font-size: 0.9rem; }

  .chevron { display: flex; color: #9ca3af; transition: transform 0.2s; }
  .chevron.rotated { transform: rotate(180deg); }
  .chevron :global(svg) { width: 14px; height: 14px; }

  .ws-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 240px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    padding: 6px;
    z-index: 1000;
  }

  .ws-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .ws-item-container {
    display: flex;
    align-items: center;
    border-radius: 8px;
    margin-bottom: 2px;
    transition: background 0.2s;
  }

  .ws-item-container:hover { background: #f9fafb; }
  .ws-item-container.active { background: #f0f7ff; }

  .ws-item-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: #374151;
  }

  .active .ws-item-btn { color: #2563eb; font-weight: 600; }

  .ws-item-actions {
    display: flex;
    gap: 2px;
    padding-right: 6px;
    opacity: 0;
  }

  .ws-item-container:hover .ws-item-actions { opacity: 1; }

  .ws-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    width: 100%;
  }

  .ws-input {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.875rem;
    outline: none;
  }

  .ws-input:focus { border-color: #3b82f6; }

  .icon-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #9ca3af;
    border-radius: 4px;
    display: flex;
  }

  .icon-btn:hover { background: #e5e7eb; color: #374151; }
  .icon-btn.del:hover { color: #ef4444; }
  .icon-btn.save { color: #10b981; }
  .icon-btn :global(svg) { width: 14px; height: 14px; }

  .ws-footer {
    border-top: 1px solid #f3f4f6;
    margin-top: 4px;
    padding-top: 4px;
  }

  .add-ws-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: #6b7280;
    border-radius: 6px;
  }

  .add-ws-btn:hover { background: #f3f4f6; color: #111827; }
  .add-ws-btn :global(svg) { width: 14px; height: 14px; }

  .chat-breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: #111827;
    font-weight: 500;
  }

  .sep { color: #d1d5db; }
  .chat-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
</style>
