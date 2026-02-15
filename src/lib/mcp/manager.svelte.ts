// src/lib/mcp/manager.svelte.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Command } from "@tauri-apps/plugin-shell";
// Используем системный fetch для обхода CORS и ошибок Preflight (405)
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/**
 * Адаптер для работы с локальными MCP-серверами через Tauri Shell
 */
class TauriStdioTransport implements Transport {
  private command: Command<string> | null = null;
  private child: any = null;
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;

  constructor(private commandName: string, private args: string[] = [], private env: Record<string, string> = {}) {}

  async start() {
    try {
      this.command = Command.create(this.commandName, this.args, { env: this.env });
      
      this.command.on('close', (data: { code: number | null, signal: number | null }) => {
        if (this.onclose) this.onclose();
      });

      this.command.on('error', (error: string) => {
        if (this.onerror) this.onerror(new Error(error));
      });

      this.command.stdout.on('data', (line: string) => {
        if (this.onmessage) {
          try {
            const json = JSON.parse(line);
            this.onmessage(json);
          } catch (e) {
            // Игнорируем не-JSON вывод (логи сервера и т.д.)
          }
        }
      });

      this.child = await this.command.spawn();
    } catch (err: any) {
      if (this.onerror) this.onerror(err);
      throw err;
    }
  }

  async send(message: any) {
    if (!this.child) throw new Error("Process not started");
    await this.child.write(JSON.stringify(message) + "\n");
  }

  async close() {
    if (this.child) {
      await this.child.kill();
      this.child = null;
    }
    if (this.onclose) this.onclose();
  }
}

/**
 * Гибридный HTTP транспорт для Tauri.
 * Поддерживает сохранение сессии через заголовок mcp-session-id.
 */
class TauriHttpTransport implements Transport {
  private closeController = new AbortController();
  private cleanUrl: string;
  private sessionHeaders: Record<string, string> = {}; 
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;

  constructor(
    private url: string, 
    private headers: Record<string, string> = {},
    private getTimeout: () => number // Геттер для получения актуального таймаута (в секундах)
  ) {
    this.cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  }

  async start() {
    return Promise.resolve();
  }

  async send(message: any) {
    // console.log("send:", JSON.stringify(message, null, 2));
    const isInitializedNotification = (message as any).method === 'notifications/initialized';
    
    // Создаем контроллер таймаута для конкретного запроса. 
    // Получаем секунды и переводим в мс для setTimeout и логирования
    const timeoutSec = this.getTimeout();
    const timeoutMs = timeoutSec * 1000;
    const timeoutController = new AbortController();
    const timerId = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
      const response = await tauriFetch(this.cleanUrl, {
        method: 'POST',
        headers: { 
          ...this.headers, 
          ...this.sessionHeaders, 
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(message),
        // Объединяем сигнал закрытия транспорта и сигнал таймаута
        signal: AbortSignal.any([this.closeController.signal, timeoutController.signal])
      });

      // Очищаем таймер при получении ответа
      clearTimeout(timerId);

      // Извлекаем ID сессии, если сервер его прислал
      const sid = response.headers.get('mcp-session-id');
      if (sid) {
        this.sessionHeaders['mcp-session-id'] = sid;
      }

      if (!response.ok && !isInitializedNotification) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await response.json();
        
        if (isInitializedNotification && json.error?.code === -32001) {
          return;
        }

        if (this.onmessage) {
          setTimeout(() => this.onmessage?.(json), 0);
        }
      } else {
        const reader = response.body?.getReader();
        if (reader) {
          this.readStream(reader);
        }
      }
    } catch (e: any) {
      clearTimeout(timerId);
      if (e.name === 'AbortError' && !this.closeController.signal.aborted) {
        if (this.onerror) this.onerror(new Error(`MCP Request timed out after ${timeoutSec}s`));
      } else if (e.name !== 'AbortError' && this.onerror) {
        this.onerror(e);
      }
      if (!isInitializedNotification) throw e;
    }
  }

  private async readStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data && this.onmessage) {
              try { this.onmessage(JSON.parse(data)); } catch(e) {}
            }
          } else if (trimmed.startsWith("{")) {
            if (this.onmessage) {
              try { this.onmessage(JSON.parse(trimmed)); } catch(e) {}
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError' && this.onerror) this.onerror(e);
    }
  }

  async close() {
    this.closeController.abort();
    if (this.onclose) this.onclose();
  }
}

export interface MCPTool {
  name: string;
  description?: string;
  enabled: boolean;
  alwaysAllow: boolean;
  inputSchema?: any; 
}

export interface MCPToolState {
  enabled: boolean;
  alwaysAllow: boolean;
}

export interface MCPServerState {
  enabled: boolean;
  autoApproveAll: boolean;
  isExpanded: boolean;
  tools: Record<string, MCPToolState>;
}

export interface MCPServerConfig {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export class MCPServerInstance {
  name = $state('');
  url = $state(''); 
  headers = $state<Record<string, string>>({}); 
  enabled = $state(false); // Разрешено ли соединение (Toggle)
  isConnected = $state(false); // Установлено ли соединение по факту (Индикатор)
  autoApproveAll = $state(true);
  isExpanded = $state(false);
  isLoading = $state(false);
  tools = $state<MCPTool[]>([]);
  error = $state<string | null>(null);
  protocolName = $state<string | null>(null); // Оригинальное name из serverInfo

  // Состояние для инструкций и метаданных сервера
  instructions = $state<string | null>(null);
  
  // СОСТОЯНИЕ ДЛЯ ВИЗУАЛИЗАЦИИ ТАЙМЕРА
  retryProgress = $state(0); // 0..100%
  retryTimeLeft = $state(0); // Время до следующей попытки в мс

  workspaceId: string = '';

  private client: Client | null = null;
  public config: MCPServerConfig;
  onStateChange: () => void;

  // ТАЙМЕРЫ И ПАРАМЕТРЫ ПЕРЕПОДКЛЮЧЕНИЯ
  private heartbeatInterval: any = null;
  private retryTimeout: any = null;
  private progressInterval: any = null;
  private readonly CHECK_INTERVAL = 30000; // 30 секунд
  private retryAttempt = 0;

  constructor(
    config: MCPServerConfig,
    initialState?: MCPServerState,
    onStateChange?: () => void
  ) {
    this.config = config;
    this.name = config.name;
    this.url = config.url || '';
    this.headers = config.headers || {};
    this.onStateChange = onStateChange || (() => {});

    if (initialState) {
      this.autoApproveAll = initialState.autoApproveAll ?? true;
      this.isExpanded = initialState.isExpanded ?? false;
      this.enabled = initialState.enabled ?? false;
      
      // Загружаем сохраненные инструменты прямо в this.tools
      // Они будут восстановлены при подключении
      if (initialState.tools && Object.keys(initialState.tools).length > 0) {
        this.tools = Object.entries(initialState.tools).map(([name, state]) => ({
          name,
          description: undefined,
          inputSchema: undefined,
          enabled: state.enabled,
          alwaysAllow: state.alwaysAllow
        }));
      }
    }
  }

  serialize(): MCPServerState {
    const toolStates: Record<string, MCPToolState> = {};
    this.tools.forEach(t => {
      toolStates[t.name] = { 
        enabled: t.enabled, 
        alwaysAllow: t.alwaysAllow 
      };
    });

    return {
      enabled: this.enabled,
      autoApproveAll: this.autoApproveAll,
      isExpanded: this.isExpanded,
      tools: toolStates
    };
  }


  /**
   * Возвращает отформатированную секцию инструкций для системного промпта
   */
  getSystemInstructions(): string | null {
    if (!this.enabled || !this.isConnected || !this.instructions) return null;
    
    let header = `### SERVER: ${this.name}`;
    
    if (this.protocolName && this.protocolName !== this.name) {
      header += ` (Implementation: ${this.protocolName})`;
    }

    return `${header}\n${this.instructions}`;
  }

  getToolByName(name: string): MCPTool | undefined {
    return this.tools.find(t => t.name === name);
  }

  async callTool(toolName: string, arguments_?: any) {
    if (!this.client || !this.isConnected) {
      throw new Error(`Server ${this.name} is not connected`);
    }

    try {
      return await this.client.callTool({
        name: toolName,
        arguments: arguments_
      });
    } catch (e: any) {
      console.error(`[MCP CallTool Error] ${this.name}/${toolName}:`, e);
      // Если во время вызова произошла ошибка — проверяем связь немедленно
      this.checkConnection();
      throw e;
    }
  }

  notify() {
    if (this.onStateChange) this.onStateChange();
  }

  async connect() {
    if (this.isLoading) return; 
    
    this.isLoading = true;
    this.error = null;
    this.isConnected = false;
    this.stopProgress(); // Сбрасываем визуальный таймер при попытке подключения

    try {
      let transport: Transport;

      if (this.config.url) {
        // Передаем динамический геттер таймаута из синглтона менеджера
        transport = new TauriHttpTransport(
          this.config.url, 
          this.headers,
          () => mcpManager.globalTimeout
        );
      } else if (this.config.command) {
        transport = new TauriStdioTransport(
          this.config.command,
          this.config.args || [],
          this.config.env || {}
        );
      } else {
        throw new Error("Server configuration missing");
      }

      this.client = new Client(
        { name: "cai-client", version: "1.0.0" },
        { capabilities: {} }
      );

      // connect() возвращает Promise<void>, поэтому результат мы не присваиваем
      await this.client.connect(transport);
      
      const clientAny = this.client as any;
      
      // Достаем инструкции (тип возвращает string | undefined)
      this.instructions = clientAny.getInstructions?.() || null;
      
      // Достаем информацию о сервере
      const serverInfo = clientAny.getServerInfo?.();
      if (serverInfo) {
        this.protocolName = serverInfo.name || null;
      }

      const response = await this.client.listTools();
      
      // Обновляем список инструментов: сохраняем состояние для имеющихся, добавляем новые
      this.tools = response.tools.map(t => {
        const savedTool = this.getToolByName(t.name);
        return {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          enabled: savedTool ? savedTool.enabled : true,
          alwaysAllow: savedTool ? savedTool.alwaysAllow : true
        };
      });
      
      this.isConnected = true; 
      this.retryAttempt = 0; // Сброс попыток при успехе
      this.startHeartbeat(); // Запуск мониторинга
      this.notify(); 
    } catch (e: any) {
      console.error(`[MCP Connect Error] ${this.name}:`, e);
      this.error = e.message || "Failed to connect";
      this.isConnected = false;
      this.notify();
      
      // Планируем повтор с визуальным прогрессом
      this.scheduleRetry();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Планирует повторное подключение и запускает интервал обновления прогресса
   */
  private scheduleRetry() {
    if (!this.enabled || this.retryTimeout) return;

    this.retryAttempt++;
    const delay = Math.min(Math.pow(2, this.retryAttempt) * 1000, 30000);
    const startTime = Date.now();

    this.startProgress(startTime, delay);

    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      this.stopProgress();
      if (this.enabled && !this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  private startProgress(startTime: number, duration: number) {
    this.stopProgress();
    this.progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      this.retryProgress = progress;
      this.retryTimeLeft = Math.max(duration - elapsed, 0);
      
      if (progress >= 100) this.stopProgress();
    }, 200); // Обновление 5 раз в секунду
  }

  private stopProgress() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.retryProgress = 0;
    this.retryTimeLeft = 0;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => this.checkConnection(), this.CHECK_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    this.stopProgress();
  }

  /**
   * Проверяет, жива ли сессия, и если нет — инициирует переподключение
   */
  private async checkConnection() {
    if (!this.enabled || this.isLoading || !this.client) return;

    try {
      // Используем ping вместо listTools для экономии ресурсов
      await this.client.ping();
    } catch (e) {
      console.warn(`[MCP Heartbeat] Server ${this.name} lost connection`);
      this.isConnected = false;
      this.reconnect();
    }
  }

  async reconnect() {
    await this.disconnect();
    if (this.enabled) {
      await this.connect();
    }
  }

  async disconnect() {
    this.stopHeartbeat();
    this.retryAttempt = 0; // Сбрасываем попытки при ручном отключении
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        console.warn(`[MCP Disconnect Warning] ${this.name}:`, e);
      }
    }
    this.isConnected = false;
    // Инструменты НЕ очищаются при дисконнекте
    // Они очищаются только когда:
    // 1. Нового списка нет такого инструмента (удален на сервере)
    // 2. MCP-сервер удален из конфига (в removeWorkspace)
    this.client = null;
    this.instructions = null;
    this.protocolName = null;
    this.notify();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this.connect();
    } else {
      this.disconnect();
    }
  }
}

/**
 * Глобальный менеджер MCP-серверов
 */
export class MCPManager {
  instances = $state<MCPServerInstance[]>([]);
  // Глобальное значение таймаута (в СЕКУНДАХ для синхронизации с UI и конфигом)
  globalTimeout = $state(300); 

  constructor() {}

  /**
   * Собирает все инструкции от подключенных серверов КОНКРЕТНОГО воркспейса
   */
  getFullSystemInstructions(workspaceId: string): string {
    // Фильтруем инстансы строго по воркспейсу
    const activeInstructions = this.instances
      .filter(inst => inst.workspaceId === workspaceId) // Добавили фильтрацию!
      .map(inst => inst.getSystemInstructions())
      .filter(Boolean);

    if (activeInstructions.length === 0) return "";

    return (
      "\n## MCP SERVERS ADDITIONAL INSTRUCTIONS\n" +
      "The following MCP servers are connected and provide specific guidelines on how to use their tools effectively:\n\n" +
      activeInstructions.join("\n\n") +
      "\n"
    );
  }
  
  async initializeWorkspaceServers(workspaceOrId: any) {
    let workspaceId: string;

    // Универсальная обработка: принимаем и ID (строку), и объект воркспейса
    if (typeof workspaceOrId === 'string') {
      workspaceId = workspaceOrId;
    } else {
      workspaceId = workspaceOrId.id;
      // Если передали объект, сразу синхронизируем таймаут из его настроек
      this.globalTimeout = workspaceOrId.settings?.mcpTimeout || 300;
    }

    const workspaceServers = this.getForWorkspace(workspaceId);
    
    // Запускаем подключения параллельно
    await Promise.all(workspaceServers.map(async (server) => {
      // Подключаем только если: разрешен пользователем И еще не подключен И не в процессе загрузки
      if (server.enabled && !server.isConnected && !server.isLoading) {
        await server.connect();
      }
    }));
  }
  
  getOrCreate(
    workspaceId: string,
    name: string,
    url: string,
    headers: Record<string, string> = {},
    initialState?: MCPServerState,
    onStateChange?: () => void
  ): MCPServerInstance {
    let instance = this.instances.find(
      i => i.workspaceId === workspaceId && i.name === name
    );

    if (!instance) {
      const config: MCPServerConfig = { name, url, headers };
      instance = new MCPServerInstance(config, initialState, onStateChange);
      instance.workspaceId = workspaceId;
      this.instances.push(instance);
    }

    return instance;
  }

  getForWorkspace(workspaceId: string): MCPServerInstance[] {
    return this.instances.filter(i => i.workspaceId === workspaceId);
  }

  async removeWorkspace(workspaceId: string) {
    const toRemove = this.getForWorkspace(workspaceId);
    for (const instance of toRemove) {
      // Очищаем инструменты при удалении MCP-сервера
      instance.tools = [];
      await instance.disconnect();
    }
    this.instances = this.instances.filter(i => i.workspaceId !== workspaceId);
  }

  private save() {
    console.log("[MCP Manager] State persistent trigger");
  }
}

// Экспорт синглтона
export const mcpManager = new MCPManager();
``