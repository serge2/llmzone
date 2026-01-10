<script lang="ts">
  import { fetch } from '@tauri-apps/plugin-http';
  import { onMount } from 'svelte';
  import { loadConfig, saveConfig } from '$lib/config';
  import type { Workspace, Chat, Message, AppSettings } from '$lib/types';
  import { loadChats, saveChats } from '$lib/storage/chatStorage';
  import Inspector from '$lib/components/Inspector.svelte';
  
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';

  // --- Состояние приложения (Svelte 5 Runes) ---
  let workspaces = $state<Workspace[]>([]);
  let selectedWorkspaceId = $state<string>('');
  let selectedChatId = $state<string>('');
  
  let message = $state("");
  let isTyping = $state(false);
  let abortController: AbortController | null = null;
  let wasAbortedManually = $state(false); // Флаг для корректной обработки прерывания

  let selectedTab = $state<'chats' | 'settings'>('chats');
  let sidebarVisible = $state(true);
  let searchActive = $state(false);
  let chatSearch = $state('');
  
  let chatWindowComponent = $state<ReturnType<typeof ChatWindow>>();

  // --- Производные состояния ---
  const currentWorkspace = $derived(workspaces.find(w => w.id === selectedWorkspaceId));
  const currentChat = $derived(currentWorkspace?.chats.find(c => c.id === selectedChatId));
  const collapsedWorkspaces = $state<Record<string, boolean>>({});

  onMount(async () => {
    // 1. Загружаем данные из обоих источников
    // config теперь имеет тип AppSettings | null благодаря правкам в loadConfig
    const config = await loadConfig();
    // Гарантируем, что history — это массив, даже если файл пуст
    const savedChats = await loadChats();
    const history = savedChats || [];
    
    if (config?.workspaces && config.workspaces.length > 0) {
      // 2. Собираем воркспейсы: настройки из конфига + чаты из хранилища
      workspaces = config.workspaces.map(ws => ({
        ...ws,
        // Ищем чаты в истории по ID воркспейса
        chats: history.find(h => h.id === ws.id)?.chats || []
      })) as Workspace[];

      // 3. Восстанавливаем последнее выбранное состояние
      selectedWorkspaceId = config.lastSelectedWorkspaceId || workspaces[0].id;
      
      // Находим актуальный воркспейс, чтобы корректно выбрать чат
      const activeWs = workspaces.find(w => w.id === selectedWorkspaceId);
      if (activeWs && activeWs.chats.length > 0) {
        selectedChatId = activeWs.chats[0].id;
      }
    } else {
      // 4. Инициализация дефолтного воркспейса при самом первом запуске
      const defaultWs: Workspace = {
        id: 'ws-' + Date.now(),
        name: 'Основной',
        icon: '🏠',
        settings: {
          apiUrl: 'http://localhost:1234/v1',
          apiKey: '',
          modelName: 'local-model',
          systemPrompt: 'You are a helpful assistant.',
          temperature: 0.7
        },
        chats: [{ id: 'c-' + Date.now(), name: 'Новый чат', history: [] }]
      };
      
      workspaces = [defaultWs];
      selectedWorkspaceId = defaultWs.id;
      selectedChatId = defaultWs.chats[0].id;

      // Сразу сохраняем раздельно: структуру в конфиг, чаты в базу данных
      await persistConfig();
      await persistChats();
    }
  });

  // --- Работа с хранилищем (Раздельная) ---
  async function persistConfig() {
    // Подготавливаем список воркспейсов без данных чатов
    const workspacesToSave = workspaces.map(({ chats, ...rest }) => rest);
    
    // Создаем объект, строго соответствующий интерфейсу AppSettings
    const configToSave: AppSettings = {
      theme: 'system', // Добавляем обязательное поле
      lastSelectedWorkspaceId: selectedWorkspaceId,
      workspaces: workspacesToSave
    };

    await saveConfig(configToSave);
  }

  async function persistChats() {
    // Сохраняем только ID воркспейсов и их чаты
    const historyToSave = workspaces.map(ws => ({
      id: ws.id,
      chats: ws.chats
    }));

    // Используем 'as any', чтобы не переписывать типы во внешнем модуле storage
    // Это допустимо, так как данные будут просто сериализованы в JSON
    await saveChats(historyToSave as any);
  }

  // Для обратной совместимости или массового сохранения
  async function saveToLocal() {
    await persistConfig();
    await persistChats();
  }

  // --- Управление структурой ---
  function createWorkspace() {
    const newWs: Workspace = { 
      id: 'ws-' + Date.now(), 
      name: 'Workspace ' + (workspaces.length + 1), 
      icon: 'W',
      settings: {
        apiUrl: 'http://localhost:1234',
        apiKey: '',
        modelName: 'local-model',
        systemPrompt: '',
        temperature: 0.7
      },
      chats: [] 
    };
    workspaces = [newWs, ...workspaces];
    persistConfig();
  }

  function createChat() {
    if (!currentWorkspace) return;
    const newChat: Chat = { id: 'c-' + Date.now(), name: 'Новый чат', history: [] };
    currentWorkspace.chats = [newChat, ...currentWorkspace.chats];
    // Обновляем ссылку на массив для триггера реактивности Svelte 5
    workspaces = [...workspaces];
    selectedChatId = newChat.id;
    persistChats();
  }

  function selectChat(chatId: string, wsId: string) {
    selectedWorkspaceId = wsId;
    selectedChatId = chatId;
    // Скроллим вниз при переключении на чат
    chatWindowComponent?.scrollToBottom();
    persistConfig(); // Сохраняем выбор воркспейса
  }

  function stopGeneration() {
    if (abortController) {
      wasAbortedManually = true; // Указываем, что это намеренная остановка
      abortController.abort();
      abortController = null;
      isTyping = false;
    }
  }

  // --- Обработчики манипуляций с сообщениями ---
  async function handleEditMessage(index: number, newText: string) {
    if (!currentChat) return;
    
    // Отрезаем историю после редактируемого сообщения (стандартное поведение LLM чатов)
    let newHistory = [...currentChat.history];
    newHistory[index] = { ...newHistory[index], text: newText };
    newHistory = newHistory.slice(0, index + 1);
    
    currentChat.history = newHistory;
    workspaces = [...workspaces];
    await persistChats();

    message = ""; // Очищаем инпут, чтобы sendMessage не дублировала сообщение
    await sendMessage();
  }

  async function handleRegenerateMessage() {
    if (!currentChat || isTyping) return;
    
    // Удаляем последнее AI сообщение
    const lastIndex = currentChat.history.length - 1;
    if (lastIndex >= 0 && currentChat.history[lastIndex].role === 'assistant') {
      currentChat.history.splice(lastIndex, 1);
    }
    
    // Удаляем последнее user сообщение и сохраняем его текст для повторной отправки
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

// --- Основная логика отправки и стриминга ---
  async function sendMessage() {
    // Если модель уже отвечает, кнопка работает как "Стоп"
    if (isTyping) {
      stopGeneration();
      return;
    }

    if (!currentChat || !currentWorkspace) return;

    // ФИКСИРУЕМ целевой чат и настройки воркспейса, чтобы при переключении 
    // воркспейсов во время генерации ответ не улетел в другое место
    const chatToUpdate = currentChat;
    const settings = currentWorkspace.settings;
    const chatToUpdateId = selectedChatId;

    abortController = new AbortController();
    wasAbortedManually = false;

    // Добавляем сообщение из инпута в историю, если оно не пустое (для регенерации оно пустое здесь)
    if (message.trim()) {
      chatToUpdate.history = [...chatToUpdate.history, { role: "user", text: message }];

      // Перемещение чата наверх списка (последний активный чат)
      const chatIndex = currentWorkspace.chats.findIndex(c => c.id === chatToUpdateId);
      if (chatIndex > 0) {
        const [movedChat] = currentWorkspace.chats.splice(chatIndex, 1);
        currentWorkspace.chats.unshift(movedChat);
        // Триггерим обновление массива воркспейсов для Svelte 5
        workspaces = [...workspaces];
      }
      
      // СОХРАНЯЕМ чаты после добавления сообщения пользователя
      await persistChats();
    }
    
    if (chatToUpdate.history.length === 0) return;

    // Подготовка "бульбы" для ответа ИИ
    const aiMsgIndex = chatToUpdate.history.length;
    chatToUpdate.history = [...chatToUpdate.history, { role: "assistant", text: "" }];
    
    message = "";
    isTyping = true;
    
    // Скроллим только если мы всё еще в том же чате
    if (chatToUpdateId === selectedChatId) {
        await chatWindowComponent?.scrollToBottom();
    }

    try {
      const base = settings.apiUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": settings.apiKey ? `Bearer ${settings.apiKey}` : ""
        },
        body: JSON.stringify({
          model: settings.modelName,
          temperature: settings.temperature,
          messages: [
            // Подмешиваем системный промпт воркспейса
            ...(settings.systemPrompt ? [{ role: 'system', content: settings.systemPrompt }] : []),
            ...chatToUpdate.history.slice(0, -1).map(m => ({ role: m.role, content: m.text }))
          ],
          stream: true
        }),
        signal: abortController.signal
      });

      if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          
          if (trimmed.startsWith("data: ")) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content || "";
              
              if (content) {
                // Обновляем текст в зафиксированном чате
                chatToUpdate.history[aiMsgIndex].text += content;
                
                // Триггерим обновление дерева состояний (только UI)
                workspaces = [...workspaces];
                
                if (chatToUpdateId === selectedChatId) {
                    chatWindowComponent?.scrollToBottom();
                }
              }
            } catch (e) { /* Игнорируем ошибки парсинга чанков */ }
          }
        }
      }
    } catch (err: any) {
      if (wasAbortedManually) {
        chatToUpdate.history[aiMsgIndex].text += "\n\n**[Генерация прервана пользователем]**";
      } else {
        // Удаляем заготовку ассистента при ошибке сети
        chatToUpdate.history = chatToUpdate.history.filter((_, i) => i !== aiMsgIndex);
        alert("Ошибка связи с моделью: " + (err.message || "Unknown error"));
      }
    } finally {
      isTyping = false;
      abortController = null;
      wasAbortedManually = false;
      workspaces = [...workspaces];
      // СОХРАНЯЕМ чаты только один раз после завершения всей генерации
      await persistChats();
    }
  }
</script>

<main class="app-container">
  <header>
    <button class="sidebar-toggle" onclick={() => sidebarVisible = !sidebarVisible} aria-label="Toggle sidebar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
    <div class="chat-title">
      {#if currentWorkspace}
        <span class="breadcrumb-ws">{currentWorkspace.name}</span>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-chat">{currentChat?.name || 'Выберите чат'}</span>
      {:else}
        Загрузка...
      {/if}
    </div>
  </header>

  <div class="main-row">
    <nav class="workspace-nav">
      <div class="ws-list">
        {#each workspaces as ws}
          <button 
            class="ws-selector-btn" 
            class:active={selectedWorkspaceId === ws.id}
            onclick={() => {
              selectedWorkspaceId = ws.id;
              if (ws.chats.length > 0) selectedChatId = ws.chats[0].id;
              selectedTab = 'chats';
              persistConfig();
            }}
          >
            <span class="ws-icon">{ws.icon}</span>
            <span class="ws-name">{ws.name}</span>
          </button>
        {/each}
        <button class="ws-add-inline" onclick={createWorkspace}>
          <span>+</span> Добавить пространство
        </button>
      </div>

      <div class="ws-footer">
        <button 
          class="ws-selector-btn settings-btn" 
          class:active={selectedTab === 'settings'}
          onclick={() => selectedTab = 'settings'}
        >
          <span class="ws-icon">⚙️</span>
          <span class="ws-name">Настройки</span>
        </button>
      </div>
    </nav>

    {#if selectedTab === 'chats'}
      {#if sidebarVisible}
        <Sidebar 
          workspaces={workspaces.filter(w => w.id === selectedWorkspaceId)} 
          {selectedChatId} 
          bind:chatSearch
          bind:searchActive
          onCreateChat={createChat}
          onSelectChat={selectChat} 
        />
      {/if}

      <ChatWindow 
        bind:this={chatWindowComponent}
        history={currentChat?.history || []}
        {isTyping} 
        bind:message 
        onSendMessage={sendMessage}
        onEditMessage={handleEditMessage}
        onCopyMessage={handleCopyMessage}
        onDeleteMessage={handleDeleteMessage}
        onRegenerateMessage={handleRegenerateMessage}
      />

      <Inspector 
        currentWorkspace={currentWorkspace} 
        onSettingsChange={persistConfig} 
      />

    {:else}
      <div class="settings-view">
        <h2>Глобальные настройки</h2>
        <p>Настройки приложения и интерфейса.</p>
      </div>
    {/if}
  </div>
</main>

<style>
  /* Общая структура приложения */
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #ffffff;
    color: #1a1a1b;
  }

  header {
    height: 48px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    background: #ffffff;
    flex-shrink: 0;
  }

  .main-row {
    display: flex;
    flex: 1;
    overflow: hidden; /* Важно, чтобы контент не распирал экран */
  }

  /* Кнопки и иконки хедера */
  .sidebar-toggle {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: 4px;
  }

  .sidebar-toggle:hover {
    background-color: #f3f4f6;
  }

  /* Хлебные крошки в заголовке */
  .chat-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .breadcrumb-ws { color: #6b7280; font-weight: normal; }
  .breadcrumb-separator { color: #d1d5db; font-size: 0.8rem; }
  .breadcrumb-chat { font-weight: 600; color: #111827; }

  /* Левая панель воркспейсов */
  .workspace-nav {
    width: 240px;
    background: #f9fafb;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .ws-list {
    flex: 1;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .ws-footer {
    padding: 12px;
    border-top: 1px solid #e5e7eb;
    background: #f3f4f6;
  }

  .ws-selector-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    color: #4b5563;
  }

  .ws-selector-btn:hover {
    background: #e5e7eb;
  }

  .ws-selector-btn.active {
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
    color: #5865f2;
  }

  .ws-icon {
    font-size: 1.25rem;
    width: 24px;
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  .ws-name {
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ws-add-inline {
    background: none;
    border: 1px dashed #d1d5db;
    margin-top: 8px;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.8rem;
    color: #6b7280;
    text-align: center;
    transition: all 0.2s;
  }

  .ws-add-inline:hover {
    border-color: #9ca3af;
    background: #f3f4f6;
    color: #374151;
  }

  /* Вид глобальных настроек */
  .settings-view {
    flex: 1;
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
    overflow-y: auto;
  }

  .settings-view h2 {
    margin-bottom: 20px;
    font-weight: 700;
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
