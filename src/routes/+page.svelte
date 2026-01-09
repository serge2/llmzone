<script lang="ts">
  import { fetch } from '@tauri-apps/plugin-http';
  import { onMount } from 'svelte';
  import { loadConfig, saveConfig } from '$lib/config';
  import type { Workspace, Message, Chat, Settings } from '$lib/types';
  import { loadChats, saveChats } from '$lib/storage/chatStorage';
  
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';

  // Состояние приложения
  let message = "";
  let isTyping = false;
  let abortController: AbortController | null = null;
  let wasAbortedManually = false; // Флаг для корректной обработки прерывания

  let selectedTab: 'chats' | 'settings' = 'chats';
  let inspectorTab: 'context' | 'model' = 'model';
  let sidebarVisible = true;
  let searchActive = false;
  let chatSearch = '';
  
  let workspaces: Workspace[] = [{ id: 'ws-1', name: 'Workspace 1', chats: [{ id: 'c-1', name: 'Общий чат', history: [] }] }];
  let selectedWorkspaceId: string = workspaces[0].id;
  let selectedChatId: string = workspaces[0].chats[0].id;
  let collapsedWorkspaces: Record<string, boolean> = {};

  let apiUrl = 'http://localhost:1234';
  let apiKey = '';
  let modelName = 'local-model';

  let chatWindowComponent: ChatWindow;

  // Реактивные переменные для текущего выбора
  $: currentWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
  $: currentChat = currentWorkspace?.chats.find(c => c.id === selectedChatId);

  onMount(async () => {
    const savedConfig = await loadConfig();
    if (savedConfig) {
      apiUrl = savedConfig.apiUrl;
      apiKey = savedConfig.apiKey;
      modelName = savedConfig.modelName;
    }

    const savedChats = await loadChats();
    if (savedChats) {
      workspaces = savedChats;
      selectedWorkspaceId = savedChats[0]?.id;
      selectedChatId = savedChats[0]?.chats[0]?.id;
    }
  });

  async function handleSaveSettings() {
    await saveConfig({ apiUrl, apiKey, modelName });
    alert('Настройки сохранены!');
  }

  async function saveToLocal() {
    await saveChats(workspaces);
}

  function createWorkspace() {
    const newWs = { id: 'ws-' + Date.now(), name: 'Workspace ' + (workspaces.length + 1), chats: [] };
    workspaces = [newWs, ...workspaces];
    saveToLocal();
  }

  function createChat() {
    const newChat = { id: 'c-' + Date.now(), name: 'Новый чат', history: [] };
    if (currentWorkspace) {
      currentWorkspace.chats = [newChat, ...currentWorkspace.chats];
      workspaces = [...workspaces];
      selectedChatId = newChat.id;
      saveToLocal();
    }
  }

  function selectChat(chatId: string, wsId: string) {
    selectedWorkspaceId = wsId;
    selectedChatId = chatId;
    chatWindowComponent?.scrollToBottom();
  }

  function stopGeneration() {
    if (abortController) {
      wasAbortedManually = true; // Указываем, что это намеренная остановка
      abortController.abort();
      abortController = null;
      isTyping = false;
    }
  }

  function handleEditMessage(index: number, currentText: string) {
    const newText = prompt('Редактировать сообщение:', currentText);
    if (newText !== null && newText !== currentText && currentChat) {
      currentChat.history[index].text = newText;
      workspaces = [...workspaces];
      saveToLocal();
    }
  }

  function handleCopyMessage(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Сообщение скопировано!');
    });
  }

  function handleDeleteMessage(index: number) {
    if (!currentChat) return;
    if (confirm('Удалить это сообщение?')) {
      currentChat.history = currentChat.history.filter((_, i) => i !== index);
      workspaces = [...workspaces];
      saveToLocal();
    }
  }

  async function handleRegenerateMessage() {
    if (!currentChat || isTyping) return;
    
    // Удаляем последнее AI сообщение
    const lastIndex = currentChat.history.length - 1;
    if (lastIndex >= 0 && currentChat.history[lastIndex].role === 'ai') {
      currentChat.history.splice(lastIndex, 1);
    }
    
    // Удаляем последнее user сообщение и сохраняем его текст
    const userIndex = lastIndex - 1;
    let userMessage = '';
    if (userIndex >= 0 && currentChat.history[userIndex].role === 'user') {
      userMessage = currentChat.history[userIndex].text;
      currentChat.history.splice(userIndex, 1);
    }
    
    workspaces = [...workspaces];
    message = userMessage;
    saveToLocal();
    
    // Отправляем сообщение заново
    await sendMessage();
  }

  async function sendMessage() {
    // Если модель уже отвечает, кнопка работает как "Стоп"
    if (isTyping) {
      stopGeneration();
      return;
    }

    if (!message.trim() || !currentChat) return;

    // Инициализация контроллера отмены
    abortController = new AbortController();
    wasAbortedManually = false;
    const { signal } = abortController;

    const userText = message;
    currentChat.history = [...currentChat.history, { role: "user", text: userText }];
    
    // Подготовка "бульбы" для ответа ИИ
    const aiMsgIndex = currentChat.history.length;
    currentChat.history = [...currentChat.history, { role: "ai", text: "" }];
    
    workspaces = [...workspaces];
    message = "";
    isTyping = true;
    await chatWindowComponent?.scrollToBottom();

    try {
      const base = apiUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": apiKey ? `Bearer ${apiKey}` : ""
        },
        body: JSON.stringify({
          model: modelName,
          messages: currentChat.history.slice(0, -1).map(m => ({
            role: (m.role === 'ai' || m.role === 'assistant') ? 'assistant' : 'user',
            content: m.text
          })),
          stream: true
        }),
        signal 
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
              
              // Наполняем текст текущего сообщения
              currentChat.history[aiMsgIndex].text += content;
              
              // Триггер обновления интерфейса
              workspaces = [...workspaces];
              chatWindowComponent?.scrollToBottom();
            } catch (e) {
              // Игнорируем ошибки парсинга отдельных чанков
            }
          }
        }
      }
    } catch (err: any) {
      // ПРОВЕРКА: Было ли прерывание ручным или это ошибка сети
      if (wasAbortedManually) {
        const currentContent = currentChat.history[aiMsgIndex].text;
        currentChat.history[aiMsgIndex].text = currentContent + "\n\n**[Генерация прервана пользователем]**";
      } else {
        // Настоящая ошибка (модель упала, нет интернета и т.д.)
        currentChat.history[aiMsgIndex].text = "Ошибка связи с моделью: " + (err.message || "Unknown error");
        currentChat.history[aiMsgIndex].role = "error";
      }
    } finally {
      isTyping = false;
      abortController = null;
      wasAbortedManually = false;
      workspaces = [...workspaces];
      await saveChats(workspaces);
    }
  }
</script>

<main class="app-container">
  <header>
    <button class="sidebar-toggle" on:click={() => sidebarVisible = !sidebarVisible} aria-label="Toggle sidebar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
    </button>
    <span class="chat-title">{currentChat?.name || 'Выберите чат'}</span>
  </header>

  <div class="main-row">
    <nav class="left-nav" class:collapsed={!sidebarVisible}>
      <button class:active={selectedTab === 'chats'} on:click={() => selectedTab = 'chats'} title="Чаты">
        <span class="nav-icon">💬</span><span class="nav-text">Чаты</span>
      </button>
      <button class:active={selectedTab === 'settings'} on:click={() => selectedTab = 'settings'} title="Настройки">
        <span class="nav-icon">⚙️</span><span class="nav-text">Настройки</span>
      </button>
    </nav>

    {#if selectedTab === 'chats'}
      {#if sidebarVisible}
        <Sidebar 
          {workspaces} {selectedChatId} {collapsedWorkspaces}
          bind:chatSearch bind:searchActive
          onCreateWorkspace={createWorkspace} onCreateChat={createChat}
          onSelectChat={selectChat} onToggleWorkspace={(id) => {
            collapsedWorkspaces[id] = !collapsedWorkspaces[id];
            collapsedWorkspaces = {...collapsedWorkspaces};
          }}
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

      <aside class="inspector">
        <div class="tabs">
          <button class:active={inspectorTab === 'model'} on:click={() => inspectorTab = 'model'}>Model</button>
          <button class:active={inspectorTab === 'context'} on:click={() => inspectorTab = 'context'}>Context</button>
        </div>
        <div class="content">
          {#if inspectorTab === 'model'}
            <p>Текущая модель: <b>{modelName}</b></p>
          {:else}
            <p class="muted">Контекст пуст.</p>
          {/if}
        </div>
      </aside>
    {:else}
      <div class="settings-view">
        <h2>Настройки API</h2>
        <div class="field"><label for="apiUrl">API URL</label><input id="apiUrl" bind:value={apiUrl} /></div>
        <div class="field"><label for="apiKey">API Key</label><input id="apiKey" type="password" bind:value={apiKey} /></div>
        <div class="field"><label for="modelName">Имя модели</label><input id="modelName" bind:value={modelName} /></div>
        <button class="save-btn" on:click={handleSaveSettings}>Сохранить настройки</button>
      </div>
    {/if}
  </div>
</main>

<style>
  /* Стили без изменений */
  :global(body) { margin: 0; font-family: sans-serif; height: 100vh; overflow: hidden; }
  .app-container { display: flex; flex-direction: column; height: 100vh; background: #fff; }
  header { height: 48px; display: flex; align-items: center; padding: 0 15px; border-bottom: 1px solid #eee; gap: 15px; font-weight: 600; }
  .sidebar-toggle { background: none; border: none; cursor: pointer; color: #666; padding: 4px; border-radius: 4px; }
  .main-row { display: flex; flex: 1; overflow: hidden; }
  .left-nav { width: 60px; border-right: 1px solid #eee; display: flex; flex-direction: column; align-items: center; padding-top: 10px; gap: 8px; background: #f9f9f9; transition: width 0.2s ease; }
  .left-nav button { background: none; border: none; cursor: pointer; opacity: 0.5; display: flex; align-items: center; gap: 12px; padding: 12px; width: 90%; justify-content: center; border-radius: 8px; }
  .left-nav button.active { opacity: 1; color: #007bff; background: #eef2ff; }
  .nav-text { display: none; }
  @media (min-width: 900px) {
    .left-nav:not(.collapsed) { width: 180px; align-items: flex-start; padding: 10px; }
    .left-nav:not(.collapsed) .nav-text { display: inline; }
    .left-nav:not(.collapsed) button { justify-content: flex-start; }
  }
  .inspector { width: 260px; border-left: 1px solid #eee; background: #fbfbfb; }
  .inspector .tabs { display: flex; border-bottom: 1px solid #eee; }
  .inspector .tabs button { flex: 1; padding: 12px; border: none; background: none; cursor: pointer; font-size: 0.8rem; }
  .inspector .tabs button.active { border-bottom: 2px solid #007bff; color: #007bff; }
  .inspector .content { padding: 15px; }
  .settings-view { padding: 40px; max-width: 500px; margin: 0 auto; width: 100%; }
  .field { margin-bottom: 20px; }
  .field label { display: block; margin-bottom: 5px; font-weight: bold; }
  .field input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; }
  .save-btn { padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; }
</style>
