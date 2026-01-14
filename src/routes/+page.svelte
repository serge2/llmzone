<script lang="ts">
  import { fetch } from '@tauri-apps/plugin-http';
  import { onMount } from 'svelte';
  import { loadConfig, saveConfig } from '$lib/config';
  import type { Workspace, Chat, Message, AppSettings, GlobalConfig } from '$lib/types';
  import { loadChats, saveChats } from '$lib/storage/chatStorage';
  import Inspector from '$lib/components/Inspector.svelte';
  
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';
  import GlobalSettings from '$lib/components/GlobalSettings.svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';

  // --- Импорт новых сервисов для MCP ---
  import { ChatService } from '$lib/services/chatService';
  import type { MCPServerInstance } from '$lib/mcp/manager.svelte';

  // --- Состояние приложения (Svelte 5 Runes) ---
  let workspaces = $state<Workspace[]>([]);
  let selectedWorkspaceId = $state<string>('');
  let selectedChatId = $state<string>('');
  
  // Глобальные настройки
  let globalConfig = $state<GlobalConfig>({
    apiUrl: 'http://localhost:1234/v1',
    apiKey: '',
    modelName: 'local-model'
  });

  let message = $state("");
  // Словарь для независимых контроллеров отмены: { chatId: AbortController }
  let abortControllers = $state<Record<string, AbortController>>({});
  let manualAborts = $state<Record<string, boolean>>({}); 

  let selectedTab = $state<'chats' | 'settings'>('chats');
  let sidebarVisible = $state(true);
  let searchActive = $state(false);
  let chatSearch = $state('');
  
  let chatWindowComponent = $state<ReturnType<typeof ChatWindow>>();

  // Инстанс сервиса чата
  const chatService = new ChatService();
  // Список активных MCP серверов (синхронизируется через Inspector)
  let mcpServers = $state<MCPServerInstance[]>([]);

  // --- Производные состояния ---
  const currentWorkspace = $derived(workspaces.find(w => w.id === selectedWorkspaceId));
  const currentChat = $derived(currentWorkspace?.chats.find(c => c.id === selectedChatId));
  const collapsedWorkspaces = $state<Record<string, boolean>>({});

  onMount(async () => {
    // 1. Загружаем данные из обоих источников
    const config = await loadConfig();
    const savedChats = await loadChats();
    const history = savedChats || [];
    
    // Загружаем глобальные настройки если они есть
    if (config?.globalConfig) {
      globalConfig = { ...globalConfig, ...config.globalConfig };
    }

    if (config?.workspaces && config.workspaces.length > 0) {
      // 2. Собираем воркспейсы: настройки из конфига + чаты из хранилища
      workspaces = config.workspaces.map(ws => ({
        ...ws,
        settings: {
          lastActiveTab: 'model', // Значение по умолчанию для старых конфигов
          ...ws.settings
        },
        chats: history.find(h => h.id === ws.id)?.chats.map(c => ({
          ...c,
          isGenerating: false // Инициализируем флаг генерации
        })) || []
      })) as Workspace[];

      // 3. Восстанавливаем последнее выбранное состояние
      selectedWorkspaceId = config.lastSelectedWorkspaceId || workspaces[0].id;
      
      const activeWs = workspaces.find(w => w.id === selectedWorkspaceId);
      if (activeWs && activeWs.chats.length > 0) {
        selectedChatId = activeWs.chats[0].id;
      }
    } else {
      // 4. Инициализация дефолтного воркспейса
      const defaultWs: Workspace = {
        id: 'ws-' + Date.now(),
        name: 'Основной',
        icon: '🏠',
        settings: {
          apiUrl: '', // Пусто, чтобы использовался глобальный
          apiKey: '',
          modelName: '',
          systemPrompt: '',
          temperature: 0.7,
          lastActiveTab: 'model'
        },
        chats: [{ id: 'c-' + Date.now(), name: 'Новый чат', history: [], isGenerating: false }]
      };
      
      workspaces = [defaultWs];
      selectedWorkspaceId = defaultWs.id;
      selectedChatId = defaultWs.chats[0].id;

      await persistConfig();
      await persistChats();
    }
  });

  // --- Работа с хранилищем (Раздельная) ---
 async function persistConfig() {
    // Делаем глубокий "снимок" состояния, чтобы избавиться от прокси
    const rawWorkspaces = $state.snapshot(workspaces);
    
    // Подготавливаем данные для конфига: убираем чаты, оставляем настройки
    const workspacesToSave = rawWorkspaces.map(({ chats, ...rest }) => rest);
    
    const configToSave: AppSettings = {
      theme: 'system', // Можно позже заменить на динамическую переменную
      lastSelectedWorkspaceId: selectedWorkspaceId,
      workspaces: workspacesToSave,
      globalConfig: $state.snapshot(globalConfig)
    };
    
    await saveConfig(configToSave);
  }

  async function persistChats() {
    const historyToSave = workspaces.map(ws => ({
      id: ws.id,
      chats: ws.chats.map(({ isGenerating, ...c }) => c) // Не сохраняем флаг генерации в БД
    }));
    await saveChats(historyToSave as any);
  }

  async function saveToLocal() {
    await persistConfig();
    await persistChats();
  }

  // --- Управление структурой ---
  function createWorkspace() {
    const newWsId = 'ws-' + Date.now();
    const newChatId = 'c-' + Date.now();
    const newWs: Workspace = { 
      id: newWsId, 
      name: 'Workspace ' + (workspaces.length + 1), 
      icon: '📁',
      settings: {
        apiUrl: '',
        apiKey: '',
        modelName: '',
        systemPrompt: '',
        temperature: 0.7,
        lastActiveTab: 'model'
      },
      chats: [{ 
        id: newChatId, 
        name: 'Новый чат', 
        history: [], 
        isGenerating: false 
      }] 
    };
    // Добавляем новый воркспейс в начало списка
    workspaces = [newWs, ...workspaces];
    
    // Устанавливаем активные ID
    selectedWorkspaceId = newWsId;
    selectedChatId = newChatId;
    
    // Сбрасываем поиск при переключении
    chatSearch = '';
    
    persistConfig();
    persistChats();
  }

  function handleRenameWorkspace(id: string, newName: string) {
    const ws = workspaces.find(w => w.id === id);
    if (ws) {
      ws.name = newName;
      workspaces = [...workspaces];
      persistConfig();
    }
  }

  async function handleDeleteWorkspace(id: string) {
    if (workspaces.length <= 1) return;
    
    const ws = workspaces.find(w => w.id === id);
    if (confirm(`Удалить рабочее пространство "${ws?.name}" и все его чаты?`)) {
      workspaces = workspaces.filter(w => w.id !== id);
      
      if (selectedWorkspaceId === id) {
        selectedWorkspaceId = workspaces[0].id;
        selectedChatId = workspaces[0].chats[0]?.id || '';
      }
      
      await persistConfig();
      await persistChats();
    }
  }

  function createChat() {
    if (!currentWorkspace) return;
    const newChat: Chat = { id: 'c-' + Date.now(), name: 'Новый чат', history: [], isGenerating: false };
    currentWorkspace.chats = [newChat, ...currentWorkspace.chats];
    selectedChatId = newChat.id;
    persistChats();
  }

  function selectChat(chatId: string, wsId: string) {
    selectedWorkspaceId = wsId;
    selectedChatId = chatId;
    chatWindowComponent?.scrollToBottom();
    persistConfig();
  }

  function stopGeneration(chatId?: string) {
    const id = chatId || selectedChatId;
    if (abortControllers[id]) {
      manualAborts[id] = true;
      abortControllers[id].abort();
      delete abortControllers[id];
      
      // Сбрасываем флаг в объекте чата
      const chat = workspaces.flatMap(ws => ws.chats).find(c => c.id === id);
      if (chat) chat.isGenerating = false;
      workspaces = [...workspaces];
    }
  }

  // --- Обработчики манипуляций с сообщениями ---
  async function handleEditMessage(index: number, newText: string) {
    if (!currentChat) return;
    
    let newHistory = [...currentChat.history];
    newHistory[index] = { ...newHistory[index], text: newText };
    newHistory = newHistory.slice(0, index + 1);
    
    currentChat.history = newHistory;
    workspaces = [...workspaces];
    await persistChats();

    message = "";
    await sendMessage();
  }

  async function handleRegenerateMessage() {
    if (!currentChat || currentChat.isGenerating) return;
    
    const lastIndex = currentChat.history.length - 1;
    if (lastIndex >= 0 && currentChat.history[lastIndex].role === 'assistant') {
      currentChat.history.splice(lastIndex, 1);
    }
    
    const userIndex = currentChat.history.length - 1;
    let userMessage = '';
    if (userIndex >= 0 && currentChat.history[userIndex].role === 'user') {
      userMessage = currentChat.history[userIndex].text;
      currentChat.history.splice(userIndex, 1);
    }
    
    workspaces = [...workspaces];
    message = userMessage;
    await sendMessage();
  }

  function handleDeleteMessage(index: number) {
    if (!currentChat) return;
    currentChat.history = currentChat.history.filter((_, i) => i !== index);
    workspaces = [...workspaces];
    persistChats();
  }

  function handleCopyMessage(text: string) {
    navigator.clipboard.writeText(text);
  }

  // --- Основная логика отправки (теперь через ChatService с поддержкой MCP) ---
  async function sendMessage() {
    if (!currentChat || !currentWorkspace) return;

    if (currentChat.isGenerating) {
      stopGeneration(currentChat.id);
      return;
    }

    const chatToUpdate = currentChat;
    
    // Подготовка эффективных настроек
    const effectiveSettings = {
      apiUrl: currentWorkspace.settings.apiUrl || globalConfig.apiUrl,
      apiKey: currentWorkspace.settings.apiKey || globalConfig.apiKey,
      modelName: currentWorkspace.settings.modelName || globalConfig.modelName,
      systemPrompt: currentWorkspace.settings.systemPrompt,
      temperature: currentWorkspace.settings.temperature,
      mcpStates: currentWorkspace.settings.mcpStates
    };

    const chatToUpdateId = chatToUpdate.id;

    // Создаем новый контроллер для этого конкретного чата
    const controller = new AbortController();
    abortControllers[chatToUpdateId] = controller;

    // Добавляем сообщение пользователя если оно не пустое
    if (message.trim()) {
      chatToUpdate.history = [...chatToUpdate.history, { role: "user", text: message }];
      
      const chatIndex = currentWorkspace.chats.findIndex(c => c.id === chatToUpdateId);
      if (chatIndex > 0) {
        const [movedChat] = currentWorkspace.chats.splice(chatIndex, 1);
        currentWorkspace.chats.unshift(movedChat);
      }
      
      message = "";
      workspaces = [...workspaces];
      await persistChats();
    }
    
    if (chatToUpdate.history.length === 0) return;

    // Скролл при начале
    if (chatToUpdateId === selectedChatId) {
        await chatWindowComponent?.scrollToBottom();
    }

    try {
      // Вызываем универсальный сервис чата, который обработает цепочку MCP инструментов
      await chatService.send(
        chatToUpdate,
        effectiveSettings,
        mcpServers, // Передаем активные инстансы серверов
        () => {
          // Коллбэк для реактивного обновления UI при каждом шаге (tool_call, ответ и т.д.)
          workspaces = [...workspaces];
          if (chatToUpdateId === selectedChatId) {
              chatWindowComponent?.scrollToBottom();
          }
        },
        controller.signal
      );
    } catch (err: any) {
      console.error("SendMessage Error:", err);
    } finally {
      delete abortControllers[chatToUpdateId];
      workspaces = [...workspaces];
      await persistChats();
    }
  }

  function handleRenameChat(chatId: string, newName: string) {
    if (!currentWorkspace) return;
    const chat = currentWorkspace.chats.find(c => c.id === chatId);
    if (chat) {
      chat.name = newName;
      workspaces = [...workspaces];
      persistChats();
    }
  }

  async function handleDeleteChat(chatId: string) {
    if (!currentWorkspace) return;
    stopGeneration(chatId);
    currentWorkspace.chats = currentWorkspace.chats.filter(c => c.id !== chatId);
    if (selectedChatId === chatId) {
      selectedChatId = currentWorkspace.chats[0]?.id || '';
    }
    workspaces = [...workspaces];
    await persistChats();
  }

</script>

<main class="app-container">
  {#if selectedTab === 'settings'}
    <div class="modal-layer">
      <GlobalSettings 
        {globalConfig} 
        onSave={persistConfig} 
        onClose={() => selectedTab = 'chats'} 
      />
    </div>
  {/if}

  <AppHeader 
    bind:workspaces={workspaces}
    {selectedWorkspaceId}
    currentChatName={currentChat?.name || 'Выберите чат'}
    bind:sidebarVisible={sidebarVisible}
    onSelectWorkspace={(id: string) => {
      selectedWorkspaceId = id;
      const ws = workspaces.find(w => w.id === id);
      if (ws?.chats.length) selectedChatId = ws.chats[0].id;
      persistConfig();
    }}
    onCreateWorkspace={createWorkspace}
    onRenameWorkspace={handleRenameWorkspace}
    onDeleteWorkspace={handleDeleteWorkspace}
  />

  <div class="main-row">
    {#if sidebarVisible}
      <Sidebar 
        bind:workspaces={workspaces} 
        {selectedWorkspaceId}
        {selectedChatId} 
        bind:chatSearch={chatSearch}
        bind:searchActive={searchActive}
        onCreateChat={createChat}
        onSelectChat={selectChat} 
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => {
          selectedTab = 'settings';
        }}
      />
    {/if}

    <div class="center-content">
      <ChatWindow 
        bind:this={chatWindowComponent}
        history={currentChat?.history || []}
        isGenerating={currentChat?.isGenerating || false} 
        bind:message
        onSendMessage={sendMessage}
        onEditMessage={handleEditMessage}
        onCopyMessage={handleCopyMessage}
        onDeleteMessage={handleDeleteMessage}
        onRegenerateMessage={handleRegenerateMessage}
      />
    </div>

    <Inspector 
      bind:currentWorkspace={workspaces[workspaces.findIndex(w => w.id === selectedWorkspaceId)]} 
      {globalConfig} 
      bind:serverInstances={mcpServers}
      onSettingsChange={persistConfig} 
    />
  </div>
</main>

<style>
  /* Глобальный сброс для предотвращения внешнего скролла */
  :global(body), :global(html) {
    margin: 0;
    padding: 0;
    height: 100vh;
    overflow: hidden;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background-color: #ffffff;
    color: #1a1a1b;
    overflow: hidden; /* Критично для фиксации */
    position: fixed;
    top: 0;
    left: 0;
  }

  .modal-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    background: white;
  }

  .main-row {
    display: flex;
    flex: 1;
    overflow: hidden; 
    min-height: 0; /* Разрешает flex-контейнеру сжиматься */
  }

  .center-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    min-width: 0;
  }

  /* Скроллбары */
  ::-webkit-scrollbar {
    width: 6px;
  }

  ::-webkit-scrollbar-thumb {
    background-color: #d1d5db;
    border-radius: 10px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }
</style>
