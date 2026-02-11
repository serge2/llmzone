<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { fetch } from '@tauri-apps/plugin-http';
  import { onMount, untrack } from 'svelte';
  import { loadConfig, saveConfig } from '$lib/config';
  import type { Workspace, Chat, Message, AppSettings, GlobalConfig, Attachment } from '$lib/types'; // Добавлен импорт Attachment
  // Обновленные импорты для работы с раздельными чатами
  import { 
    loadChatsForWorkspace, 
    saveChatsForWorkspace, 
    deleteWorkspaceFolder,
    loadChatHistory,    // НОВОЕ: импорт для ленивой загрузки
    deleteChatFolder    // НОВОЕ: импорт для удаления папки чата
  } from '$lib/storage/chatStorage';
  import Inspector from '$lib/components/Inspector.svelte';
  
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ChatWindow from '$lib/components/ChatWindow.svelte';
  import GlobalSettings from '$lib/components/GlobalSettings.svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';

  // --- Импорт новых сервисов для MCP ---
  import { ChatService } from '$lib/services/chatService';
  // Менеджер теперь импортируется как синглтон для управления кэшем инстансов
  import { mcpManager, MCPServerInstance } from '$lib/mcp/manager.svelte';

  // --- Импорты для Tauri 2 ---
  import { openUrl } from '@tauri-apps/plugin-opener';
  // --- Система локализации --
  import { setLocale, getLocale } from '$paraglide/runtime';
  import * as m from '$paraglide/messages';

  // --- Состояние приложения (Svelte 5 Runes) ---
  let workspaces = $state<Workspace[]>([]);
  let selectedWorkspaceId = $state<string>('');
  let selectedChatId = $state<string>('');
  let isHistoryLoading = $state(false); // НОВОЕ: состояние загрузки истории
  
  // Глобальные настройки
  let globalConfig = $state<GlobalConfig>({
    apiUrl: 'http://localhost:1234/v1',
    apiKey: '',
    modelName: 'local-model'
  });

  // --- РЕАКТИВНЫЙ МОСТИК ЛОКАЛИЗАЦИИ ---
  // Мы создаем явный стейт для локали, чтобы Svelte видел его изменения
  let currentLocaleState = $state(getLocale());

  let message = $state("");
  // Словарь для независимых контроллеров отмены: { chatId: AbortController }
  let abortControllers = $state<Record<string, AbortController>>({});
  let manualAborts = $state<Record<string, boolean>>({}); 

  let selectedTab = $state<'chats' | 'settings'>('chats');
  let sidebarVisible = $state(true);
  let inspectorVisible = $state(true); // Состояние видимости правой панели
  let searchActive = $state(false);
  let chatSearch = $state('');
  
  let chatWindowComponent = $state<ReturnType<typeof ChatWindow>>();

  // Инстанс сервиса чата
  const chatService = new ChatService();
  // Список активных MCP серверов ДЛЯ ТЕКУЩЕГО ЭКРАНА (отображение в Инспекторе)
  let mcpServers = $state<MCPServerInstance[]>([]);

  // --- Состояние кастомного контекстного меню ---
  let menuState = $state({
    visible: false,
    x: 0,
    y: 0,
    href: ''
  });

  // --- Производные состояния ---
  const currentWorkspace = $derived(workspaces.find(w => w.id === selectedWorkspaceId));
  const currentChat = $derived(currentWorkspace?.chats.find(c => c.id === selectedChatId));
  const collapsedWorkspaces = $state<Record<string, boolean>>({});

  // Реактивный заголовок чата, который обновляется при смене языка
  const headerChatName = $derived.by(() => {
    // Используем нашу руну как зависимость
    currentLocaleState;
    return currentChat?.name || m.sidebar_no_chats();
  });

  // --- ЛОГИКА ИНИЦИАЛИЗАЦИИ MCP СЕРВЕРОВ ---
  async function syncMCPServers() {
    if (workspaces.length === 0) return;

    // 1. Синхронизируем инстансы для ВСЕХ воркспейсов в глобальном менеджере
    // Это важно для фоновой работы чатов в неактивных воркспейсах
    workspaces.forEach(ws => {
      try {
        const rawConfig = ws.settings.mcpConfig || '{}';
        const config = JSON.parse(rawConfig);
        const serversDict = config.mcpServers || {};

        for (const [name, info] of Object.entries(serversDict)) {
          const serverData = info as any;
          // Обновлено: проверяем и URL, и command (для локальных серверов)
          if (!serverData.url && !serverData.command) continue;

          const savedState = ws.settings.mcpStates?.[name];
          
          // Менеджер вернет существующий инстанс или создаст новый уникальный (wsId + name)
          mcpManager.getOrCreate(
            ws.id,
            name,
            serverData.url,
            serverData.headers || {},
            savedState,
            () => { persistConfig(); }
          );
        }
      } catch (e) {
        console.error(`MCP Sync Error for workspace ${ws.id}:`, e);
      }
    });

    // 2. Обновляем локальный список серверов только для отображения в текущем Inspector
    if (selectedWorkspaceId) {
      mcpServers = mcpManager.getForWorkspace(selectedWorkspaceId);
      // НОВОЕ: Инициируем подключение разрешенных серверов при входе в воркспейс
      // ПЕРЕДАЕМ ОБЪЕКТ, чтобы менеджер считал mcpTimeout
      const ws = workspaces.find(w => w.id === selectedWorkspaceId);
      if (ws) {
        await mcpManager.initializeWorkspaceServers(ws);
      }
    }
  }

  // Следим за сменой воркспейса для мгновенной переинициализации серверов
  $effect(() => {
    const wsId = selectedWorkspaceId;
    if (wsId) {
      untrack(() => {
        // При смене воркспейса просто обновляем список отображаемых серверов
        syncMCPServers();
      });
    }
  });

  // --- Логика перехвата внешних ссылок и контекстного меню ---
  $effect(() => {
    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor) {
        const href = anchor.getAttribute('href');
        // Проверяем, что ссылка внешняя (начинается с http/https)
        if (href && /^https?:\/\//.test(href)) {
          event.preventDefault();
          openUrl(href).catch((err: unknown) => {
            console.error('Failed to open external link:', err);
          });
        }
      }
      // Закрываем наше меню при обычном клике в любом месте
      menuState.visible = false;
    };

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor) {
        // Если кликнули по ссылке — показываем кастомное меню
        event.preventDefault();
        menuState = {
          visible: true,
          x: event.clientX,
          y: event.clientY,
          href: anchor.href
        };
      } else if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
        // Блокируем стандартное меню везде, кроме полей ввода
        event.preventDefault();
        menuState.visible = false;
      } else {
        // В полях ввода скрываем наше меню, позволяя работать нативному
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
    // 1. Загружаем основной конфиг приложения
    const config = await loadConfig();

    // Устанавливаем язык ПЕРВЫМ делом, чтобы UI не мерцал
    if (config?.language) {
      setLocale(config.language, { reload: false });
      currentLocaleState = config.language; // Синхронизируем руну
    }
    
    // Загружаем глобальные настройки если они есть
    if (config?.globalConfig) {
      globalConfig = { ...globalConfig, ...config.globalConfig };
    }

    if (config?.workspaces && config.workspaces.length > 0) {
      // 2. Инициализируем воркспейсы и подгружаем чаты для каждого из своих каталогов
      const loadedWorkspaces = await Promise.all(config.workspaces.map(async (ws) => {
        const savedChats = await loadChatsForWorkspace(ws.id);
        
        return {
          ...ws,
          settings: {
            lastActiveTab: 'model',
            autoRenameEnabled: true, // Дефолт для существующих воркспейсов без флага
            ...ws.settings
          },
          chats: (savedChats || []).map(c => ({
            ...c,
            history: [], // Изначально история пуста (ленивая загрузка)
            isGenerating: false,
            is_untitled: c.is_untitled || false
          }))
        };
      }));

      workspaces = loadedWorkspaces as Workspace[];

      // 3. Восстанавливаем последнее выбранное состояние
      selectedWorkspaceId = config.lastSelectedWorkspaceId || workspaces[0].id;
      
      const activeWs = workspaces.find(w => w.id === selectedWorkspaceId);
      if (activeWs && activeWs.chats.length > 0) {
        const firstChat = activeWs.chats[0];
        // Подгружаем историю для первого чата
        await selectChat(firstChat.id, selectedWorkspaceId);
      } else if (activeWs) {
        selectedChatId = '';
      }

      // --- Инициализируем MCP серверы сразу после загрузки воркспейсов ---
      // ВАЖНО: Вызываем syncMCPServers, который корректно инициирует всё через объекты
      await syncMCPServers();

    } else {
      // 4. Инициализация дефолтного воркспейса
      const defaultWsId = 'ws-' + Date.now();
      const defaultWs: Workspace = {
        id: defaultWsId,
        name: m.workspace_first_name(),
        icon: '🏠',
        settings: {
          providerType: 'openai',
          apiUrl: '',
          apiKey: '',
          modelName: '',
          systemPrompt: '',
          temperature: 0.7,
          followFirstMessage: false,
          includeMcpInstructions: true,
          lastActiveTab: 'model',
          toolsLoopLimitEnabled: true,
          toolsMaxIterations: 10,
          mcpTimeout: 300,
          autoRenameEnabled: true
        },
        chats: [{ 
          id: 'c-' + Date.now(), 
          name: m.chat_new_name(), 
          history: [], 
          isGenerating: false,
          is_untitled: true
        }]
      };
      
      workspaces = [defaultWs];
      selectedWorkspaceId = defaultWsId;
      selectedChatId = defaultWs.chats[0].id;

      await persistConfig();
      await persistChats();
      
      await syncMCPServers();
    }
  });

  // --- Работа с хранилищем (Раздельная) ---
  async function persistConfig() {
    // ОБНОВЛЯЕМ РУНУ: Синхронизируем наше состояние языка с текущей локалью Paraglide
    currentLocaleState = getLocale();

    // СИНХРОНИЗАЦИЯ: Перед сохранением обновляем mcpStates для всех воркспейсов
    workspaces.forEach(ws => {
        const instances = mcpManager.getForWorkspace(ws.id);
        if (instances.length > 0) {
          const states: Record<string, any> = {};
          instances.forEach((server: MCPServerInstance) => {
              states[server.name] = server.serialize();
          });
          ws.settings.mcpStates = states;
        }
    });

    // Делаем глубокий "снимок" состояния, чтобы избавиться от прокси
    const rawWorkspaces = $state.snapshot(workspaces);
    
    // Подготавливаем данные для конфига: убираем чаты, оставляем настройки
    const workspacesToSave = rawWorkspaces.map(({ chats, ...rest }) => rest);
    
    const configToSave: AppSettings = {
      theme: 'system',
      language: getLocale() as 'en' | 'ru',
      lastSelectedWorkspaceId: selectedWorkspaceId,
      workspaces: workspacesToSave,
      globalConfig: $state.snapshot(globalConfig)
    };
    
    await saveConfig(configToSave);
    currentLocaleState = getLocale(); // Обновляем руну
    console.log("Locale updated to:", currentLocaleState); // Проверка в консоли
  }

  async function persistChats() {
    // НОВОЕ: Сохраняем чаты каждого воркспейса в его персональный каталог через новую структуру
    for (const ws of workspaces) {
      // Подготавливаем чаты: в метод сохранения передаем все чаты для обновления метаданных, 
      // история будет сохранена только для тех чатов, где она загружена и не пуста.
      await saveChatsForWorkspace(ws.id, $state.snapshot(ws.chats) as any);
    }
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
      name: m.workspace_new_name() + ' ' + (workspaces.length + 1), 
      icon: '📁',
      settings: {
        providerType: 'openai',
        apiUrl: '',
        apiKey: '',
        modelName: '',
        systemPrompt: '',
        temperature: 0.7,
        followFirstMessage: false,
        includeMcpInstructions: true,
        lastActiveTab: 'model',
        toolsLoopLimitEnabled: true,
        toolsMaxIterations: 10,
        mcpTimeout: 300,
        autoRenameEnabled: true
      },
      chats: [{ 
        id: newChatId, 
        name: m.chat_new_name(), 
        history: [], 
        isGenerating: false,
        is_untitled: true
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
    if (confirm(m.delete_workspace_confirm({ name: ws?.name || "" }))) {
      // 1. Очищаем инстансы MCP серверов из памяти
      mcpManager.removeWorkspace(id);
      
      // 2. Удаляем персональную папку воркспейса с чатами
      await deleteWorkspaceFolder(id);

      // 3. Обновляем состояние воркспейсов
      workspaces = workspaces.filter(w => w.id !== id);
      
      if (selectedWorkspaceId === id) {
        selectedWorkspaceId = workspaces[0].id;
        selectedChatId = workspaces[0].chats[0]?.id || '';
      }
      
      await persistConfig();
    }
  }

  function createChat() {
    if (!currentWorkspace) return;
    // Используем m.chat_new_name() из paraglide для дефолтного имени
    const newChat: Chat = { 
      id: 'c-' + Date.now(), 
      name: m.chat_new_name(), 
      history: [], 
      isGenerating: false,
      is_untitled: true
    };
    currentWorkspace.chats = [newChat, ...currentWorkspace.chats];
    selectedChatId = newChat.id;
    persistChats();
  }

  async function selectChat(chatId: string, wsId: string) {
    selectedWorkspaceId = wsId;
    selectedChatId = chatId;

    // НОВОЕ: Ленивая загрузка истории при выборе чата с индикацией
    const ws = workspaces.find(w => w.id === wsId);
    const chat = ws?.chats.find(c => c.id === chatId);
    
    if (chat && chat.history.length === 0) {
      isHistoryLoading = true;
      try {
        const savedHistory = await loadChatHistory(wsId, chatId);
        if (savedHistory.length > 0) {
          chat.history = savedHistory.map(msg => ({
            ...msg,
            id: msg.id || crypto.randomUUID()
          }));
          workspaces = [...workspaces];
        }
      } finally {
        isHistoryLoading = false;
      }
    }

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
    newHistory[index] = { 
      ...newHistory[index], 
      text: newText,
      id: newHistory[index].id || crypto.randomUUID() // Обеспечиваем ID при редактировании
    };
    newHistory = newHistory.slice(0, index + 1);
    
    currentChat.history = newHistory;
    workspaces = [...workspaces];
    await persistChats();

    message = "";
    await sendMessage();
  }

  async function handleRegenerateMessage() {
    if (!currentChat || currentChat.isGenerating) return;
    
    const history = currentChat.history;
    if (history.length === 0) return;

    let userMsgIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        userMsgIndex = i;
        break;
      }
    }

    if (userMsgIndex !== -1) {
      // Сбрасываем любые флаги продолжения перед регенерацией
      history.forEach(msg => msg.requiresLimitExtension = false);

      // Сохраняем текст последнего вопроса
      const lastUserText = history[userMsgIndex].text;
      const lastAttachments = history[userMsgIndex].attachments; // Сохраняем вложения
      
      // Удаляем всё, начиная с этого вопроса и до конца
      history.splice(userMsgIndex); 
      
      // Помещаем текст и вложения обратно в вызов
      message = lastUserText;
      workspaces = [...workspaces];
      await sendMessage(lastAttachments); // Передаем вложения при регенерации
    }
  }

  function handleDeleteMessage(index: number) {
    if (!currentChat) return;

    // Ссылка на историю текущего чата
    const history = currentChat.history;
    const messageToDelete = history[index];
    
    if (!messageToDelete) return;

    let deleteCount = 1;

    // Если удаляем ассистента — ищем все связанные инструменты
    if (messageToDelete.role === 'assistant') {
      for (let i = index + 1; i < history.length; i++) {
        if (history[i].role === 'tool' || history[i].role === 'assistant') {
          deleteCount++;
        } else {
          break;
        }
      }
    }

    // Удаляем из массива
    history.splice(index, deleteCount);
    
    // Триггерим реактивность Svelte 5
    workspaces = [...workspaces];
    persistChats();
  }


  function handleCopyMessage(text: string) {
    navigator.clipboard.writeText(text);
  }

  // --- ЛОГИКА ПОДТВЕРЖДЕНИЯ ИНСТРУМЕНТОВ ---
  async function handleApproveTool(callId: string, status: 'approved' | 'rejected') {
    if (!currentChat || !currentWorkspace) return;

    // 1. Находим и обновляем статус подтверждения в истории
    for (const msg of currentChat.history) {
      if (msg.tool_calls) {
        const call = msg.tool_calls.find(c => c.id === callId);
        if (call) {
          call.approvalStatus = status;
          break;
        }
      }
    }

    // 2. Если пользователь нажал "Разрешить", возобновляем цикл в ChatService
    if (status === 'approved') {
      // Используем существующий или создаем новый контроллер для возобновления
      if (!abortControllers[currentChat.id]) {
        abortControllers[currentChat.id] = new AbortController();
      }
      
      const effectiveSettings = {
        apiUrl: currentWorkspace.settings.apiUrl || globalConfig.apiUrl,
        apiKey: currentWorkspace.settings.apiKey || globalConfig.apiKey,
        modelName: currentWorkspace.settings.modelName || globalConfig.modelName,
        providerType: currentWorkspace.settings.providerType,
        systemPrompt: currentWorkspace.settings.systemPrompt,
        temperature: currentWorkspace.settings.temperature,
        mcpStates: currentWorkspace.settings.mcpStates,
        followFirstMessage: currentWorkspace.settings.followFirstMessage,
        includeMcpInstructions: currentWorkspace.settings.includeMcpInstructions,
        toolsLoopLimitEnabled: currentWorkspace.settings.toolsLoopLimitEnabled,
        toolsMaxIterations: currentWorkspace.settings.toolsMaxIterations,
        autoRenameEnabled: currentWorkspace.settings.autoRenameEnabled
      };

      const chatSpecificServers = mcpManager.getForWorkspace(currentWorkspace.id);

      try {
        await chatService.send(
          currentChat,
          effectiveSettings,
          chatSpecificServers,
          () => {
            workspaces = [...workspaces];
            chatWindowComponent?.scrollToBottom();
          },
          abortControllers[currentChat.id].signal
        );
      } catch (err) {
        console.error("Error resuming after tool approval:", err);
      } finally {
        delete abortControllers[currentChat.id];
        workspaces = [...workspaces];
        await persistChats();
      }
    } else {
      // Если отклонено, просто обновляем UI и сохраняем
      workspaces = [...workspaces];
      await persistChats();
    }
  }

  /**
   * Продолжает генерацию, если она была прервана лимитом итераций.
   * Мы просто сбрасываем флаг и вызываем sendMessage без новых сообщений пользователя.
   */
  async function handleExtendLimit() {
    if (!currentChat || !currentWorkspace) return;

    // Находим последнее сообщение с флагом и убираем его
    const lastMsg = currentChat.history[currentChat.history.length - 1];
    if (lastMsg && lastMsg.requiresLimitExtension) {
      lastMsg.requiresLimitExtension = false;
    }

    // Вызываем sendMessage. 
    // Так как переменная message пуста, сервис просто подхватит историю и пойдет на новый цикл.
    await sendMessage();

    // Принудительно скроллим вниз после запуска
    // tick().then(() => {
    //   chatWindowComponent?.scrollToBottom(true);
    // }); 
  }

  // --- Основная логика отправки (теперь через ChatService с поддержкой MCP) ---
  async function sendMessage(attachments: Attachment[] = []) { // Обновлено: принимает аттачи
    if (!currentChat || !currentWorkspace) return;

    if (currentChat.isGenerating) {
      stopGeneration(currentChat.id);
      return;
    }

    // Сбрасываем флаги продолжения лимита, если отправляется новое сообщение от пользователя
    if (message.trim() || attachments.length > 0) {
      currentChat.history.forEach(msg => msg.requiresLimitExtension = false);
    }

    const chatToUpdate = currentChat;
    
    // Находим воркспейс, к которому реально относится этот чат
    const chatWorkspace = workspaces.find(ws => ws.chats.some(c => c.id === chatToUpdate.id));
    if (!chatWorkspace) return;

    // Подготовка эффективных настроек
    const effectiveSettings = {
      apiUrl: chatWorkspace.settings.apiUrl || globalConfig.apiUrl,
      apiKey: chatWorkspace.settings.apiKey || globalConfig.apiKey,
      modelName: chatWorkspace.settings.modelName || globalConfig.modelName,
      providerType: chatWorkspace.settings.providerType,
      systemPrompt: chatWorkspace.settings.systemPrompt,
      temperature: chatWorkspace.settings.temperature,
      mcpStates: chatWorkspace.settings.mcpStates,
      followFirstMessage: chatWorkspace.settings.followFirstMessage,
      includeMcpInstructions: chatWorkspace.settings.includeMcpInstructions,
      toolsLoopLimitEnabled: chatWorkspace.settings.toolsLoopLimitEnabled,
      toolsMaxIterations: chatWorkspace.settings.toolsMaxIterations,
      autoRenameEnabled: chatWorkspace.settings.autoRenameEnabled
    };

    const chatToUpdateId = chatToUpdate.id;

    // Создаем новый контроллер для этого конкретного чата
    const controller = new AbortController();
    abortControllers[chatToUpdateId] = controller;

    // Добавляем сообщение пользователя если оно не пустое или есть вложения
    if (message.trim() || attachments.length > 0) {
      chatToUpdate.history = [...chatToUpdate.history, {
        id: crypto.randomUUID(), // Гарантируем наличие ID при отправке
        role: "user", 
        text: message,
        attachments: attachments.length > 0 ? attachments : undefined // Сохраняем аттачи
      }];
      
      const chatIndex = chatWorkspace.chats.findIndex(c => c.id === chatToUpdateId);
      if (chatIndex > 0) {
        const [movedChat] = chatWorkspace.chats.splice(chatIndex, 1);
        chatWorkspace.chats.unshift(movedChat);
      }
      
      message = "";
      workspaces = [...workspaces];
      await persistChats();
    }
    
    if (chatToUpdate.history.length === 0) return;

    // Скролл при начале (только если это текущий активный чат)
    if (chatToUpdateId === selectedChatId) {
        await chatWindowComponent?.scrollToBottom();
    }

    // Получаем специфичные для воркспейса этого чата инстанво серверов
    const chatSpecificServers = mcpManager.getForWorkspace(chatWorkspace.id);

    try {
      // Вызываем универсальный сервис чата, который обработает цепочку MCP инструментов
      await chatService.send(
        chatToUpdate,
        effectiveSettings,
        chatSpecificServers, 
        () => {
          // Коллбэк для реактивного обновления UI при каждом шаге
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
      chat.is_untitled = false;
      workspaces = [...workspaces];
      persistChats();
    }
  }

  async function handleDeleteChat(chatId: string) {
    if (!currentWorkspace) return;
    stopGeneration(chatId);
    
    // НОВОЕ: Удаляем физическую папку чата
    await deleteChatFolder(currentWorkspace.id, chatId);

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
          currentLocale={currentLocaleState}
          onSave={persistConfig} 
          onClose={() => selectedTab = 'chats'} 
        />
      </div>
    {/if}

    <AppHeader 
      bind:workspaces={workspaces}
      currentLocale={currentLocaleState}
      {selectedWorkspaceId}
      currentChatName={headerChatName}
      bind:sidebarVisible={sidebarVisible}
      bind:inspectorVisible={inspectorVisible} 
      onSelectWorkspace={(id: string) => {
        selectedWorkspaceId = id;
        const ws = workspaces.find(w => w.id === id);
        if (ws?.chats.length) {
          selectChat(ws.chats[0].id, id); // Используем selectChat для подгрузки истории
        } else {
          selectedChatId = '';
        }
        persistConfig();
      }}
      onCreateWorkspace={createWorkspace}
      onRenameWorkspace={handleRenameWorkspace}
      onDeleteWorkspace={handleDeleteWorkspace}
    />

    <div class="main-row">
      {#if sidebarVisible}
        <Sidebar 
          currentLocale={currentLocaleState}
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
          currentLocale={currentLocaleState}
          history={currentChat?.history || []}
          isGenerating={currentChat?.isGenerating || false}
          isLoading={isHistoryLoading} 
          bind:message
          onSendMessage={sendMessage}
          onEditMessage={handleEditMessage}
          onCopyMessage={handleCopyMessage}
          onDeleteMessage={handleDeleteMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onApproveTool={handleApproveTool} 
          onExtendLimit={handleExtendLimit}
        />
      </div>

      {#if inspectorVisible}
        <Inspector 
          bind:currentWorkspace={workspaces[workspaces.findIndex(w => w.id === selectedWorkspaceId)]} 
          {globalConfig} 
          currentLocale={currentLocaleState}
          bind:serverInstances={mcpServers}
          onSettingsChange={() => {
            syncMCPServers();
            persistConfig();
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
  /* Стили без изменений */
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
