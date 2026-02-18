// src/lib/services/appState.svelte.ts
import { loadConfig, saveConfig } from '$lib/config';
import type { Workspace, Chat, Message, AppSettings, Attachment } from '$lib/types';
import { 
  loadChatsForWorkspace, 
  saveChatsForWorkspace, 
  deleteWorkspaceFolder,
  loadChatHistory,
  deleteChatFolder
} from '$lib/storage/chatStorage';
import { ChatService } from '$lib/services/chatService';
import { toastService } from '$lib/services/toastService.svelte';
import { mcpManager, MCPServerInstance } from '$lib/mcp/manager.svelte';
import { setLocale, getLocale } from '$paraglide/runtime';
import * as m from '$paraglide/messages';
import { untrack } from 'svelte';

class AppState {
  // --- Состояние приложения (Svelte 5 Runes) ---
  workspaces = $state<Workspace[]>([]);
  selectedWorkspaceId = $state<string>('');
  selectedChatId = $state<string>('');
  isHistoryLoading = $state(false);
  currentPromptProgress = $state<number | null>(null);
  currentModelLoadProgress = $state<number | null>(null);
  
  // Флаг для предотвращения преждевременного сохранения при инициализации
  private isInitializing = true;

  // Изолированное состояние UI
  ui = $state({
    sidebarVisible: true,
    inspectorVisible: true
  });

  // Вспомогательные состояния для управления процессом
  abortControllers = $state<Record<string, AbortController>>({});
  mcpServers = $state<MCPServerInstance[]>([]);
  currentLocaleState = $state(getLocale());

  // Сервисы
  private chatService = new ChatService();

  // --- Производные состояния ---
  currentWorkspace = $derived(this.workspaces.find(w => w.id === this.selectedWorkspaceId));
  currentChat = $derived(this.currentWorkspace?.chats.find(c => c.id === this.selectedChatId));

  effectiveSettings = $derived.by(() => {
    if (!this.currentWorkspace) return null;
    return {
      ...this.currentWorkspace.settings,
      autoRenameEnabled: this.currentWorkspace.settings.autoRenameEnabled ?? true
    };
  });

  // --- ИНИЦИАЛИЗАЦИЯ ---
  async init() {
    this.isInitializing = true;
    const config = await loadConfig();

    if (config?.language) {
      setLocale(config.language, { reload: false });
      this.currentLocaleState = config.language;
    }

    // Загрузка состояния панелей
    if (config) {
      if (config.sidebarVisible !== undefined) this.ui.sidebarVisible = config.sidebarVisible;
      if (config.inspectorVisible !== undefined) this.ui.inspectorVisible = config.inspectorVisible;
    }

    // ИСПРАВЛЕНО: Эффект для автосохранения теперь проверяет флаг isInitializing
    // $effect.root нужен, чтобы эффект жил всё время жизни сервиса (синглтона)
    $effect.root(() => {
      $effect(() => {
        // Регистрируем зависимости для отслеживания (подписываемся на изменения видимости панелей)
        const s = this.ui.sidebarVisible;
        const i = this.ui.inspectorVisible;
        
        // Используем untrack, чтобы сохранение не вызывало бесконечных циклов
        untrack(() => {
          // Сохраняем ТОЛЬКО если инициализация завершена
          if (!this.isInitializing) {
            this.persistConfig();
          }
        });
      });
    });
    
    if (config?.workspaces && config.workspaces.length > 0) {
      const loadedWorkspaces = await Promise.all(config.workspaces.map(async (ws) => {
        const savedChats = await loadChatsForWorkspace(ws.id);
        return {
          ...ws,
          settings: { ...ws.settings },
          chats: (savedChats || []).map(c => ({
            ...c,
            history: [], 
            isGenerating: false,
            is_untitled: c.is_untitled || false
          }))
        };
      }));

      this.workspaces = loadedWorkspaces as Workspace[];
      this.selectedWorkspaceId = config.lastSelectedWorkspaceId || this.workspaces[0].id;
      
      if (this.currentWorkspace && this.currentWorkspace.chats.length > 0) {
        await this.selectChat(this.currentWorkspace.chats[0].id, this.selectedWorkspaceId);
      }
      await this.syncMCPServers();
    } else {
      await this.initDefaultWorkspace();
    }

    // Завершаем инициализацию и разрешаем сохранение
    this.isInitializing = false;
  }

  private async initDefaultWorkspace() {
    const defaultWsId = 'ws-' + Date.now();
    const defaultWs: Workspace = {
      id: defaultWsId,
      name: m.workspace_first_name(),
      icon: '🏠',
      settings: this.getDefaultSettings(),
      chats: [{ 
        id: 'c-' + Date.now(), 
        name: m.chat_new_name(), 
        history: [], 
        isGenerating: false,
        is_untitled: true
      }]
    };
    this.workspaces = [defaultWs];
    this.selectedWorkspaceId = defaultWsId;
    this.selectedChatId = defaultWs.chats[0].id;
    await this.persistConfig();
    await this.persistChats();
    await this.syncMCPServers();
  }

  // --- УПРАВЛЕНИЕ MCP ---
  async syncMCPServers() {
    if (this.workspaces.length === 0) return;

    this.workspaces.forEach(ws => {
      try {
        const config = JSON.parse(ws.settings.mcpConfig || '{}');
        const serversDict = config.mcpServers || {};

        for (const [name, info] of Object.entries(serversDict)) {
          const serverData = info as any;
          if (!serverData.url && !serverData.command) continue;
          const savedState = ws.settings.mcpStates?.[name];
          
          mcpManager.getOrCreate(
            ws.id, name, serverData.url, serverData.headers || {}, 
            savedState, () => { this.persistConfig(); }
          );
        }
      } catch (e) { console.error(`MCP Sync Error:`, e); }
    });

    if (this.selectedWorkspaceId) {
      this.mcpServers = mcpManager.getForWorkspace(this.selectedWorkspaceId);
      if (this.currentWorkspace) {
        await mcpManager.initializeWorkspaceServers(this.currentWorkspace);
      }
    }
  }

  // --- ЛОГИКА ЧАТА ---
  async selectChat(chatId: string, wsId: string) {
    this.selectedWorkspaceId = wsId;
    this.selectedChatId = chatId;

    if (this.currentChat && this.currentChat.history.length === 0) {
      this.isHistoryLoading = true;
      try {
        const savedHistory = await loadChatHistory(wsId, chatId);
        this.currentChat.history = savedHistory.map(msg => ({
          ...msg,
          id: msg.id || crypto.randomUUID()
        }));
      } finally {
        this.isHistoryLoading = false;
      }
    }
  }

  // Метод для переключения ворксейпа (выбирает первый чат)
  async selectWorkspace(id: string) {
    const ws = this.workspaces.find(w => w.id === id);
    if (ws) {
      const firstChatId = ws.chats[0]?.id || '';
      await this.selectChat(firstChatId, id);
    }
  }

  async sendMessage(text: string, attachments: Attachment[] = [], chatWindowComponent?: any) {
    if (!this.currentChat || !this.currentWorkspace || !this.effectiveSettings) return;

    if (this.currentChat.isGenerating) {
      this.stopGeneration(this.currentChat.id);
      return;
    }

    if (text.trim() || attachments.length > 0) {
      this.currentChat.history.forEach(msg => msg.requiresLimitExtension = false);
      this.currentChat.history.push({
        id: crypto.randomUUID(),
        role: "user", 
        text: text,
        attachments: attachments.length > 0 ? attachments : undefined
      });
      
      const chatIndex = this.currentWorkspace.chats.findIndex(c => c.id === this.selectedChatId);
      if (chatIndex > 0) {
        const [movedChat] = this.currentWorkspace.chats.splice(chatIndex, 1);
        this.currentWorkspace.chats.unshift(movedChat);
      }
      
      await this.persistChats();
    }
    
    if (this.currentChat.history.length === 0) return;
    chatWindowComponent?.scrollToBottom();

    const controller = new AbortController();
    this.abortControllers[this.selectedChatId] = controller;
    const chatSpecificServers = mcpManager.getForWorkspace(this.selectedWorkspaceId);

    try {
      await this.chatService.send(
        this.currentChat,
        this.effectiveSettings,
        chatSpecificServers, 
        (metadata) => {
          if (metadata?.promptProgress !== undefined) this.currentPromptProgress = metadata.promptProgress;
          if (metadata?.modelLoadProgress !== undefined) this.currentModelLoadProgress = metadata.modelLoadProgress;
          chatWindowComponent?.scrollToBottom();
        },
        controller.signal,
        (newName) => this.handleRenameChat(this.selectedChatId, newName)
      );
    } finally {
      delete this.abortControllers[this.selectedChatId];
      this.currentPromptProgress = null;
      this.currentModelLoadProgress = null;
      await this.persistChats();
    }
  }

  // --- УПРАВЛЕНИЕ СТРУКТУРОЙ ---
  createWorkspace() {
    const newWsId = 'ws-' + Date.now();
    const newChatId = 'c-' + Date.now();
    const newWs: Workspace = { 
      id: newWsId, 
      name: m.workspace_new_name() + ' ' + (this.workspaces.length + 1), 
      icon: '📁',
      settings: this.getDefaultSettings(),
      chats: [{ id: newChatId, name: m.chat_new_name(), history: [], isGenerating: false, is_untitled: true }] 
    };
    this.workspaces = [newWs, ...this.workspaces];
    this.selectedWorkspaceId = newWsId;
    this.selectedChatId = newChatId;
    this.persistConfig();
    this.persistChats();
  }

  renameWorkspace(id: string, newName: string) {
    const ws = this.workspaces.find(w => w.id === id);
    if (ws) {
      ws.name = newName;
      this.persistConfig();
    }
  }

  async handleDeleteWorkspace(id: string) {
    if (this.workspaces.length <= 1) return;
    const ws = this.workspaces.find(w => w.id === id);
    if (confirm(m.delete_workspace_confirm({ name: ws?.name || "" }))) {
      try {
        // Сначала пытаемся удалить файловые данные
        await deleteWorkspaceFolder(id);

        // Только если удаление файлов успешно - удаляем из конфига
        mcpManager.removeWorkspace(id);
        this.workspaces = this.workspaces.filter(w => w.id !== id);
        if (this.selectedWorkspaceId === id) {
          this.selectedWorkspaceId = this.workspaces[0].id;
          this.selectedChatId = this.workspaces[0].chats[0]?.id || '';
        }
        await this.persistConfig();
        console.log(`[AppState] Workspace "${ws?.name}" deleted successfully`);
      } catch (err) {
        // Если удаление файлов не удалось - НЕ удаляем из конфига, показываем ошибку
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[AppState] Failed to delete workspace "${ws?.name}":`, errorMsg);
        toastService.show(m.delete_workspace_error({ error: errorMsg }), 'error');
      }
    }
  }

  createChat() {
    if (!this.currentWorkspace) return;
    const newChat: Chat = { 
      id: 'c-' + Date.now(), 
      name: m.chat_new_name(), 
      history: [], 
      isGenerating: false,
      is_untitled: true
    };
    this.currentWorkspace.chats = [newChat, ...this.currentWorkspace.chats];
    this.selectedChatId = newChat.id;
    this.persistChats();
  }

  async handleDeleteChat(chatId: string) {
    if (!this.currentWorkspace) return;
    this.stopGeneration(chatId);
    try {
      // Сначала пытаемся удалить файловые данные чата
      await deleteChatFolder(this.currentWorkspace.id, chatId);

      // Только если удаление файлов успешно - удаляем из состояния
      this.currentWorkspace.chats = this.currentWorkspace.chats.filter(c => c.id !== chatId);
      if (this.selectedChatId === chatId) {
        this.selectedChatId = this.currentWorkspace.chats[0]?.id || '';
      }
      await this.persistChats();
      console.log(`[AppState] Chat ${chatId} deleted successfully`);
    } catch (err) {
      // Если удаление файлов не удалось - НЕ удаляем из состояния, показываем ошибку
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[AppState] Failed to delete chat ${chatId}:`, errorMsg);
      toastService.show(m.sidebar_delete_chat_error({ error: errorMsg }), 'error');
    }
  }

  handleRenameChat(chatId: string, newName: string) {
    const chat = this.currentWorkspace?.chats.find(c => c.id === chatId);
    if (chat) {
      chat.name = newName;
      chat.is_untitled = false;
      this.persistChats();
    }
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ---
  stopGeneration(chatId: string) {
    if (this.abortControllers[chatId]) {
      this.abortControllers[chatId].abort();
      delete this.abortControllers[chatId];
      const chat = this.workspaces.flatMap(ws => ws.chats).find(c => c.id === chatId);
      if (chat) chat.isGenerating = false;
      if (chatId === this.selectedChatId) this.currentPromptProgress = null;
    }
  }

  async persistConfig() {
    // Не сохраняем конфиг, если мы в процессе загрузки, чтобы не затереть данные пустым массивом
    if (this.isInitializing) return;

    this.currentLocaleState = getLocale();
    this.workspaces.forEach(ws => {
      const instances = mcpManager.getForWorkspace(ws.id);
      if (instances.length > 0) {
        const states: Record<string, any> = {};
        instances.forEach(s => states[s.name] = s.serialize());
        ws.settings.mcpStates = states;
      }
    });

    const configToSave: AppSettings = {
      theme: 'system',
      language: getLocale() as 'en' | 'ru',
      lastSelectedWorkspaceId: this.selectedWorkspaceId,
      // Используем snapshot для корректного сохранения Proxy-объектов
      workspaces: $state.snapshot(this.workspaces).map(({ chats, ...rest }: any) => rest),
      sidebarVisible: this.ui.sidebarVisible,
      inspectorVisible: this.ui.inspectorVisible
    };
    await saveConfig(configToSave);
  }

  async persistChats() {
    if (this.isInitializing) return;
    for (const ws of this.workspaces) {
      await saveChatsForWorkspace(ws.id, $state.snapshot(ws.chats) as any);
    }
  }

  private getDefaultSettings(): any {
    return {
      providerType: 'openai', apiUrl: '', apiKey: '', modelName: '', systemPrompt: '',
      temperature: 0.7, temperatureEnabled: false, topP: 0.95, topPEnabled: false,
      topK: 40, topKEnabled: false, maxCompletionTokens: 8196, maxCompletionTokensEnabled: false,
      maxTokens: 8196, maxTokensEnabled: false, followFirstMessage: false,
      includeMcpInstructions: true, lastActiveTab: 'model', toolsLoopLimitEnabled: true,
      toolsMaxIterations: 10, mcpTimeout: 300, autoRenameEnabled: true
    };
  }

  // UI Handlers
  async handleEditMessage(index: number, newText: string) {
    if (!this.currentChat) return;
    this.currentChat.history[index].text = newText;
    this.currentChat.history = this.currentChat.history.slice(0, index + 1);
    await this.sendMessage(""); 
  }

  async handleRegenerateMessage() {
    if (!this.currentChat || this.currentChat.isGenerating) return;
    const history = this.currentChat.history;
    const lastUserIdx = history.findLastIndex(m => m.role === 'user');
    if (lastUserIdx !== -1) {
      const lastMsg = history[lastUserIdx];
      history.splice(lastUserIdx);
      await this.sendMessage(lastMsg.text, lastMsg.attachments);
    }
  }

  async handleApproveTool(callId: string, status: 'approved' | 'rejected', chatWindowComponent?: any) {
    if (!this.currentChat || !this.effectiveSettings) return;
    this.currentChat.history.forEach(msg => {
      msg.tool_calls?.forEach(call => {
        if (call.id === callId) call.approvalStatus = status;
      });
    });

    if (status === 'approved') {
      const controller = new AbortController();
      this.abortControllers[this.selectedChatId] = controller;
      try {
        await this.chatService.send(
          this.currentChat, this.effectiveSettings, mcpManager.getForWorkspace(this.selectedWorkspaceId),
          (m) => { 
            if (m?.promptProgress !== undefined) this.currentPromptProgress = m.promptProgress; 
            if (m?.modelLoadProgress !== undefined) this.currentModelLoadProgress = m.modelLoadProgress;
            chatWindowComponent?.scrollToBottom(); 
          },
          controller.signal, (name) => this.handleRenameChat(this.selectedChatId, name)
        );
      } finally {
        delete this.abortControllers[this.selectedChatId];
        this.currentPromptProgress = null;
        this.currentModelLoadProgress = null;
        await this.persistChats();
      }
    }
  }

  handleDeleteMessage(index: number) {
    if (!this.currentChat) return;

    const history = this.currentChat.history;
    const targetMsg = history[index];

    // Если это сообщение пользователя или системное — удаляем только его одно
    if (targetMsg.role === 'user' || targetMsg.role === 'system') {
      history.splice(index, 1);
    } 
    // Если это сообщение ассистента (или случайно затесавшийся одиночный tool)
    // удаляем всю последовательную цепочку ответов ИИ
    else {
      let countToRemove = 1;
      
      // Итерируемся вперед от удаляемого сообщения
      for (let i = index + 1; i < history.length; i++) {
        const nextRole = history[i].role;
        // Если следующее сообщение — это результат инструмента или продолжение ответа ассистента
        if (nextRole === 'tool' || nextRole === 'assistant') {
          countToRemove++;
        } else {
          // Если встретили 'user' или 'system' — цепочка ИИ закончилась
          break;
        }
      }
      
      history.splice(index, countToRemove);
    }

    this.persistChats();
  }

  async handleExtendLimit() {
    const last = this.currentChat?.history.at(-1);
    if (last) last.requiresLimitExtension = false;
    await this.sendMessage("");
  }

  // Методы управления UI для биндинга или вызова из компонентов
  toggleSidebar = () => {
    this.ui.sidebarVisible = !this.ui.sidebarVisible;
    // Можно оставить ручной вызов или положиться на эффект в init
    this.persistConfig();
  }

  toggleInspector = () => {
    this.ui.inspectorVisible = !this.ui.inspectorVisible;
    this.persistConfig();
  }
}

export const appState = new AppState();
