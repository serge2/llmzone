<script lang="ts">
  import { fetch } from '@tauri-apps/plugin-http';
  import { tick, onMount } from 'svelte';

  // Состояния
  let message = "";
  let chatHistory: { role: string, text: string }[] = [];
  let isTyping = false;
  let chatContainer: HTMLElement;

  // UI tabs
  let selectedTab: 'chats' | 'settings' = 'chats';
  let inspectorTab: 'context' | 'model' | 'integrations' = 'context';

  // Workspaces и чаты
  let workspaces: { id: string; name: string; chats: { id: string; name: string; history: { role: string; text: string }[] }[] }[] = [
    { id: 'ws-1', name: 'Workspace 1', chats: [ { id: '1', name: 'Общий чат', history: [] } ] }
  ];
  let selectedWorkspaceId = workspaces[0].id;
  let selectedChatId = workspaces[0].chats[0].id;
  let collapsedWorkspaces: Record<string, boolean> = {};
  let searchActive = false;
  let chatSearch = '';

  // Настройки LLM API
  let apiUrl = 'http://localhost:1234';
  let apiKey = '';
  let modelName = 'local-model';

  // Sidebar visibility
  let sidebarVisible = true; // Track visibility state

  onMount(() => {
    // load settings if any
    try {
      const raw = localStorage.getItem('llmSettings');
      if (raw) {
        const s = JSON.parse(raw);
        apiUrl = s.apiUrl || apiUrl;
        apiKey = s.apiKey || apiKey;
        modelName = s.modelName || modelName;
      }
    } catch (e) { /* ignore */ }

    // load chat for selected
    const found = chats.find(c => c.id === selectedChatId);
    if (found) chatHistory = [...found.history];
  });

  function selectTab(tab: 'chats' | 'settings') {
    selectedTab = tab;
  }

  function selectInspectorTab(tab: 'context' | 'model' | 'integrations') {
    inspectorTab = tab;
  }

  function createWorkspace() {
    const id = 'ws-' + Date.now().toString();
    const ws = { id, name: 'Workspace ' + (workspaces.length + 1), chats: [] };
    workspaces = [ws, ...workspaces];
    collapsedWorkspaces[id] = false;
    selectedWorkspaceId = id;
  }

  function createChat() {
    const id = 'c-' + Date.now().toString();
    const chat = { id, name: 'Новый чат', history: [] };
    const ws = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!ws) return;
    ws.chats = [chat, ...ws.chats];
    workspaces = [...workspaces];
    selectChat(chat.id, selectedWorkspaceId);
  }

  function selectWorkspace(id: string) {
    selectedWorkspaceId = id;
    collapsedWorkspaces[id] = false;
  }

  function selectChat(id: string, workspaceId?: string) {
    if (workspaceId) selectedWorkspaceId = workspaceId;
    selectedChatId = id;
    const ws = workspaces.find(w => w.id === selectedWorkspaceId);
    const found = ws?.chats.find(c => c.id === id);
    chatHistory = found ? [...found.history] : [];
    tick().then(() => chatContainer && chatContainer.scrollTo({ top: chatContainer.scrollHeight }));
  }

  function toggleWorkspace(id: string) {
    collapsedWorkspaces[id] = !collapsedWorkspaces[id];
    collapsedWorkspaces = { ...collapsedWorkspaces };
  }

  function persistCurrentChatHistory() {
    const ws = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!ws) return;
    const chat = ws.chats.find(c => c.id === selectedChatId);
    if (!chat) return;
    chat.history = [...chatHistory];
    workspaces = [...workspaces];
  }

  function saveSettings() {
    localStorage.setItem('llmSettings', JSON.stringify({ apiUrl, apiKey, modelName }));
  }

  // Функция для прокрутки вниз
  async function scrollToBottom() {
    await tick();
    if (chatContainer) {
      chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  async function sendMessage() {
    if (!message.trim() || isTyping) return;

    const userText = message;
    // Добавляем сообщение пользователя
    chatHistory = [...chatHistory, { role: "user", text: userText }];
    persistCurrentChatHistory();
    message = "";
    isTyping = true;
    
    await scrollToBottom();

    try {
      // Формируем историю для API
      const apiMessages = chatHistory.map(msg => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.text
      }));

      const response = await fetch("http://localhost:1234/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "local-model", // LM Studio обычно игнорирует это имя и шлет активную модель
          messages: apiMessages,
          temperature: 0.7
        })
      });

      if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);

      const data = await response.json();
      const aiText = data.choices[0].message.content;

      // Добавляем ответ ИИ
      chatHistory = [...chatHistory, { role: "ai", text: aiText }];
      persistCurrentChatHistory();
    } catch (err: any) {
      console.error("Ошибка:", err);
      chatHistory = [...chatHistory, { role: "error", text: `Ошибка: ${err.message}` }];
      persistCurrentChatHistory();
    } finally {
      isTyping = false;
      await scrollToBottom();
    }
  }

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
  }

  // Обработка нажатия Enter
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<main class="app-container">
  <header>
    <div class="header-content">
      {#if selectedTab === 'chats'}
        <button class="sidebar-toggle" title="Показать/скрыть панель чатов" on:click={toggleSidebar}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9h18M3 15h18"></path>
          </svg>
        </button>
      {/if}
    </div>
  </header>

  <div class="main-row">
    <aside class="side left">
      <ul class="left-tabs">
        <li class="tab tab-chats" class:active={selectedTab === 'chats'} on:click={() => selectTab('chats')}>
          <span class="tab-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/></svg>
          </span>
          <span class="tab-text">Чаты</span>
        </li>
        <li class="tab tab-settings" class:active={selectedTab === 'settings'} on:click={() => selectTab('settings')}>
          <span class="tab-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15c.1.5.1.9.1 1.3a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2c0-.4 0-.8.1-1.3a2 2 0 0 1 .6-1.1l1.1-.9a2 2 0 0 0 .6-1.5V9.2a2 2 0 0 0-.6-1.5L4.7 6a2 2 0 0 1-.6-1.1C4 4.2 4.1 3.8 4.2 3.4A2 2 0 0 1 6 2h10a2 2 0 0 1 1.8 1.4c.1.4.2.8.1 1.2-.1.5-.4.9-.6 1.1l-1.1.9a2 2 0 0 0-.6 1.5v1.1c0 .6.2 1.1.6 1.5l1.1.9c.3.2.5.6.6 1.1z"/></svg>
          </span>
          <span class="tab-text">Настройки</span>
        </li>
      </ul>
    </aside>

    {#if selectedTab === 'chats'}
      <div class="chats-layout">
        {#if sidebarVisible}
        <div class="chats-list">
          <div class="chats-list-header">
            <div class="toolbar">
              <button class="icon" title="Опции">⋯</button>
              <button class="icon" title="Поиск" on:click={() => searchActive = !searchActive}>🔍</button>
              <button class="icon" title="Новый workspace" on:click={createWorkspace} aria-label="Новый workspace">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <path d="M3 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"></path>
                  <path d="M12 10v6"></path>
                  <path d="M9 13h6"></path>
                </svg>
              </button>
              <button class="icon icon-right" title="Новый чат" aria-label="Создать чат" on:click={createChat}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <path d="M12 5v14"></path>
                  <path d="M5 12h14"></path>
                </svg>
              </button>
            </div>
            {#if searchActive}
              <input class="chat-search" placeholder="Поиск чатов..." bind:value={chatSearch} />
            {/if}
          </div>

          <ul class="workspace-tree">
            {#each workspaces as ws}
              <li class="workspace">
                <div class="workspace-header" on:click={() => toggleWorkspace(ws.id)}>
                  <span class="caret">{collapsedWorkspaces[ws.id] ? '▸' : '▾'}</span>
                  <span class="workspace-name">{ws.name}</span>
                </div>
                {#if !collapsedWorkspaces[ws.id]}
                  <ul class="workspace-chats">
                    {#each ws.chats.filter(c => c.name.toLowerCase().includes(chatSearch.toLowerCase())) as c}
                      <li class:selected={c.id === selectedChatId} on:click={() => selectChat(c.id, ws.id)}>{c.name}</li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
        {/if}

        <div class="chat-column">
          <div class="messages" bind:this={chatContainer}>
            {#each chatHistory as msg}
              <div class="message-wrapper {msg.role}">
                <div class="message">
                  {msg.text}
                </div>
              </div>
            {/each}

            {#if isTyping}
              <div class="message-wrapper ai">
                <div class="message typing">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
              </div>
            {/if}
          </div>

          <div class="input-area">
            <textarea
              placeholder="Введите сообщение..."
              bind:value={message}
              on:keydown={handleKeydown}
            ></textarea>
            <button on:click={sendMessage} disabled={isTyping || !message.trim()}>
              {isTyping ? "..." : "Отправить"}
            </button>
          </div>
        </div>

        <aside class="inspector">
          <div class="inspector-tabs">
            <button class:active={inspectorTab === 'context'} on:click={() => selectInspectorTab('context')}>Контекст</button>
            <button class:active={inspectorTab === 'model'} on:click={() => selectInspectorTab('model')}>Модель</button>
            <button class:active={inspectorTab === 'integrations'} on:click={() => selectInspectorTab('integrations')}>Интеграции</button>
          </div>

          <div class="inspector-body">
            {#if inspectorTab === 'context'}
              <h4>Контекст</h4>
              <p class="muted">Место для показа контекстных данных и подсказок.</p>
            {:else if inspectorTab === 'model'}
              <h4>Модель</h4>
              <p class="muted">Выбранная модель: {modelName}</p>
            {:else}
              <h4>Интеграции</h4>
              <p class="muted">Список внешних интеграций (пока пусто).</p>
            {/if}
          </div>
        </aside>
      </div>
    {:else}
      <div class="settings-panel">
        <h3>Настройки подключения к LLM API</h3>
        <label>URL API
          <input type="text" bind:value={apiUrl} />
        </label>
        <label>API Key
          <input type="password" bind:value={apiKey} />
        </label>
        <label>Model name
          <input type="text" bind:value={modelName} />
        </label>
        <div style="margin-top:10px">
          <button on:click={saveSettings}>Сохранить</button>
        </div>
      </div>
    {/if}

  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #f4f4f9;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    /* max-width: 800px; */
    margin: 0 auto;
    background: white;
    box-shadow: 0 0 20px rgba(0,0,0,0.1);
  }

  header {
    padding: 1rem;
    background: #007bff;
    color: white;
    text-align: center;
  }

  .chat-window {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    background: #fdfdfd;
  }

  .message-wrapper {
    display: flex;
    width: 100%;
  }

  .message-wrapper.user { justify-content: flex-end; }
  .message-wrapper.ai { justify-content: flex-start; }

  .message {
    padding: 10px 15px;
    border-radius: 15px;
    max-width: 70%;
    word-wrap: break-word;
    white-space: pre-wrap;
    line-height: 1.4;
  }

  .user .message {
    background: #007bff;
    color: white;
    border-bottom-right-radius: 2px;
  }

  .ai .message {
    background: #e9e9eb;
    color: #333;
    border-bottom-left-radius: 2px;
  }

  .message-wrapper.error .message {
    background: #fee;
    color: #c00;
    font-size: 0.9rem;
    border: 1px solid #fcc;
    margin: 0 auto;
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .sidebar-toggle {
    background: transparent;
    border: none;
    color: #333;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: none;
  }

  .sidebar-toggle:hover {
    background: #eef2ff;
  }

  .main-row {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0; /* allow children to shrink so overflow works */
  }

  .side {
    width: 240px;
    padding: 16px;
    background: #f7f7fb;
    border-left: 1px solid #eee;
    overflow-y: auto;
    display: none;
    height: 100%;
  }

  .side.left { border-left: none; border-right: 1px solid #eee; }
  .side.right { border-left: 1px solid #eee; }

  .left-tabs { padding: 0; margin: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .left-tabs li { padding: 10px 8px; cursor: pointer; border-radius: 6px; color: #333; display:flex; align-items:center; gap:10px; }
  .left-tabs li.active { background: #e8edf9; font-weight: 600; }
  .left-tabs .tab-icon { display:inline-flex; width:18px; height:18px; align-items:center; justify-content:center; color: #333; }
  .left-tabs .tab-text { display:inline-block; }

  .chats-layout { flex: 1; display: flex; min-height: 0; min-width: 0; }
  .chats-list { width: 260px; border-right: 1px solid #eee; padding: 12px; background: #fbfbfd; overflow-y: auto; display: none; }
  .chats-list .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .chats-list .icon { background: transparent; border: 1px solid transparent; padding: 6px 8px; border-radius: 6px; cursor: pointer; color: #333; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
  .chats-list .icon:hover { background: #eef2ff; color: #08306b; }
  .chats-list .icon-right { margin-left: auto; }
  .chat-search { width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; }
  .workspace-tree { list-style: none; padding: 0; margin: 0; }
  .workspace { margin-bottom: 6px; }
  .workspace-header { padding: 6px 8px; border-radius: 6px; display: flex; gap: 8px; align-items: center; cursor: pointer; color: #222; }
  .workspace-header:hover { background: #f2f6ff; }
  .workspace-chats { list-style: none; padding: 6px 0 6px 12px; margin: 0; }
  .workspace-chats li { padding: 6px 8px; border-radius: 6px; cursor: pointer; }
  .workspace-chats li.selected { background: #eef2ff; font-weight: 600; }
  .caret { width: 18px; display: inline-block; text-align:center; color: #666; }

  .inspector { width: 320px; border-left: 1px solid #eee; background: #fbfbfd; display: none; height: 100%; align-self: stretch; color: #222; }
  .inspector-tabs { display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid #eee; background: transparent; }
  .inspector-tabs button { padding: 6px 10px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: #333; cursor: pointer; font-weight: 500; }
  .inspector-tabs button:hover { background: #eef2ff; color: #08306b; }
  .inspector-tabs button.active { background: #e6f0ff; border-color: #d3e0ff; color: #08306b; font-weight: 700; }
  .inspector-body { padding: 12px; color: #333; }

  /* Sidebars and responsive behavior */
  @media (min-width: 10px) {
    /* Show compact left tab bar (icon-only) */
    .side { display: block; width: 32px; padding: 8px; }
    .left-tabs { gap: 6px; }
    .left-tabs li { padding: 8px; justify-content: left; }
    .left-tabs .tab-text { display: none; }
    .sidebar-toggle { display: none; }
  }
  @media (min-width: 900px) {
   /* Medium layout: show left tab bar (full), chat list (depends on sidebarVisible) */
    .side { display: block; width: 240px; padding: 8px; }
    .chats-list { display: none; }
    .inspector { display: none; }
    .left-tabs .tab-text { display: inline-block; }
    .sidebar-toggle { display: inline-block; }
  }
  @media (min-width: 1000px) {
    /* Full layout: show chat list and inspector */
    .side { display: block; width: 240px; padding: 8px; }
    .chats-list { display: block; }
    .inspector { display: block; }
    .left-tabs .tab-text { display: inline-block; }
    .sidebar-toggle { display: inline-block; }
  }

  .chat-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    background: #fdfdfd;
    -webkit-overflow-scrolling: touch;
  }

  .inspector h4 { margin: 0 0 8px 0; color: #111; }
  .inspector p.muted { color: #666; font-size: 0.9rem; }

  /* Chat column and messages */
  .chat-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    background: #fdfdfd;
    -webkit-overflow-scrolling: touch;
  }

  /* Sidebars are handled in the responsive rules above */

  .input-area {
    padding: 16px;
    display: flex;
    gap: 10px;
    border-top: 1px solid #eee;
    background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.01));
  }

  textarea {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 10px;
    resize: none;
    height: 50px;
    outline: none;
  }

  textarea:focus { border-color: #007bff; }

  button {
    padding: 0 20px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:disabled { background: #ccc; cursor: not-allowed; }

  /* Анимация точек */
  .typing { display: flex; gap: 4px; padding: 15px 20px; }
  .dot {
    width: 6px; height: 6px;
    background: #888;
    border-radius: 50%;
    animation: blink 1.4s infinite both;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes blink {
    0%, 80%, 100% { opacity: 0.2; }
    40% { opacity: 1; }
  }
</style>