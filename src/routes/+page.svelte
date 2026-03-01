<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import Sidebar from '$lib/components/Sidebar.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';
  import GlobalSettings from '$lib/components/GlobalSettings.svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import InspectorComponent from '$lib/components/Inspector.svelte';
  // --- Импорт окна "О приложении" ---
  import AboutModal from '$lib/components/AboutModal.svelte';

  // --- Импорт централизованного состояния ---
  import { appState } from '$lib/services/appState.svelte';
  
  // --- Импорты для Tauri 2 ---
  import { openUrl } from '@tauri-apps/plugin-opener';
  // --- Система локализации --
  import { getLocale } from '$paraglide/runtime';
  import * as m from '$paraglide/messages';

  // --- Локальное состояние UI ---
  let selectedTab = $state<'chats' | 'settings'>('chats');
  let aboutVisible = $state(false); // Состояние для отображения окна About
  let searchActive = $state(false);
  let chatSearch = $state('');
  let message = $state("");
  
  let chatWindowComponent = $state<ReturnType<typeof ChatWindow>>();

  let menuState = $state({
    visible: false,
    x: 0,
    y: 0,
    href: ''
  });

  const headerChatName = $derived.by(() => {
    // Явно указываем зависимость от локали для обновления
    appState.currentLocaleState;
    return appState.currentChat?.name || m.sidebar_no_chats();
  });

  $effect(() => {
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && /^https?:\/\//.test(href)) {
          event.preventDefault();
          openUrl(href).catch(console.error);
        }
      }
      menuState.visible = false;
    };

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        event.preventDefault();
        menuState = { visible: true, x: event.clientX, y: event.clientY, href: anchor.href };
      } else if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
        event.preventDefault();
        menuState.visible = false;
      } else {
        menuState.visible = false;
      }
    };

    document.addEventListener('click', handleAnchorClick);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('click', handleAnchorClick);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  });

  onMount(async () => {
    await appState.init();
  });

  $effect(() => {
    const wsId = appState.selectedWorkspaceId;
    if (wsId) {
      untrack(() => {
        appState.syncMCPServers();
      });
    }
  });

  async function handleSend(attachments: any[] = []) {
    const msgCopy = message;
    message = ""; 
    await appState.sendMessage(msgCopy, attachments, chatWindowComponent);
  }
</script>

<main class="app-container">
    {#if selectedTab === 'settings'}
      <div class="modal-layer">
        <GlobalSettings 
          currentLocale={appState.currentLocaleState}
          onSave={() => appState.persistConfig()} 
          onClose={() => selectedTab = 'chats'} 
        />
      </div>
    {/if}

    {#if aboutVisible}
      <div class="modal-layer" onclick={() => aboutVisible = false} role="presentation">
        <div onclick={(e) => e.stopPropagation()} role="presentation">
          <AboutModal onClose={() => aboutVisible = false} />
        </div>
      </div>
    {/if}

    <AppHeader 
      bind:workspaces={appState.workspaces}
      currentLocale={appState.currentLocaleState}
      selectedWorkspaceId={appState.selectedWorkspaceId}
      currentChatName={headerChatName}
      bind:sidebarVisible={appState.ui.sidebarVisible}
      bind:inspectorVisible={appState.ui.inspectorVisible} 
      onSelectWorkspace={(id: string) => appState.selectChat(appState.workspaces.find(w => w.id === id)?.chats[0]?.id || '', id)}
      onCreateWorkspace={() => appState.createWorkspace()}
      onRenameWorkspace={(id, name) => appState.renameWorkspace(id, name)}
      onDeleteWorkspace={(id) => appState.handleDeleteWorkspace(id)}
    />

    <div class="main-row">
      {#if appState.ui.sidebarVisible}
        <Sidebar 
          currentLocale={appState.currentLocaleState}
          bind:workspaces={appState.workspaces} 
          selectedWorkspaceId={appState.selectedWorkspaceId}
          selectedChatId={appState.selectedChatId} 
          bind:chatSearch={chatSearch}
          bind:searchActive={searchActive}
          onCreateChat={() => appState.createChat()}
          onSelectChat={(chatId, wsId) => appState.selectChat(chatId, wsId)} 
          onRenameChat={(id, name) => appState.handleRenameChat(id, name)}
          onDeleteChat={(id) => appState.handleDeleteChat(id)}
          onOpenSettings={() => { selectedTab = 'settings'; }}
          onOpenAbout={() => { aboutVisible = true; }} 
        />
      {/if}

      <div class="center-content">
        <ChatWindow 
          bind:this={chatWindowComponent}
          currentLocale={appState.currentLocaleState}
          history={appState.currentChat?.history || []}
          isGenerating={appState.currentChat?.isGenerating || false}
          promptProgress={appState.currentPromptProgress}
          modelLoadProgress={appState.currentModelLoadProgress}
          isLoading={appState.isHistoryLoading} 
          bind:message
          onSendMessage={handleSend}
          onEditMessage={(i, txt) => appState.handleEditMessage(i, txt)}
          onCopyMessage={(txt) => navigator.clipboard.writeText(txt)}
          onDeleteMessage={(i) => appState.handleDeleteMessage(i)}
          onRegenerateMessage={() => appState.handleRegenerateMessage()}
          onApproveTool={(id, status) => appState.handleApproveTool(id, status, chatWindowComponent)} 
          onExtendLimit={() => appState.handleExtendLimit()}
        />
      </div>

      {#if appState.ui.inspectorVisible}
        <InspectorComponent 
          bind:currentWorkspace={appState.currentWorkspace} 
          currentLocale={appState.currentLocaleState}
          bind:serverInstances={appState.mcpServers}
          onSettingsChange={() => {
            appState.syncMCPServers();
            appState.persistConfig();
          }} 
        />
      {/if}
    </div>

  {#if menuState.visible}
    <div class="custom-menu" style:left="{menuState.x}px" style:top="{menuState.y}px">
      <button onclick={() => { openUrl(menuState.href); menuState.visible = false; }}>
        🌐 {m.menu_open_link()}
      </button>
      <button onclick={() => { navigator.clipboard.writeText(menuState.href); menuState.visible = false; }}>
        📋 {m.menu_copy_link()}
      </button>
    </div>
  {/if}
</main>

<style>
  .app-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #f9fafb;
  }

  .main-row {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .center-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #ffffff;
    position: relative;
    z-index: 1;
  }

  .modal-layer {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .custom-menu {
    position: fixed;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    padding: 4px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    min-width: 180px;
  }

  .custom-menu button {
    padding: 8px 12px;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: #374151;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .custom-menu button:hover {
    background: hsl(220, 14%, 96%);
    color: #111827;
  }
</style>
