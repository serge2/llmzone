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
 * Поддерживает сохранение сессии через кастомные заголовки.
 */
class TauriHttpTransport implements Transport {
  private closeController = new AbortController();
  private cleanUrl: string;
  private sessionHeaders: Record<string, string> = {}; // Хранилище сессионных заголовков
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;

  constructor(private url: string, private headers: Record<string, string> = {}) {
    this.cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  }

  async start() {
    return Promise.resolve();
  }

  async send(message: any) {
    const isInitializedNotification = (message as any).method === 'notifications/initialized';
    
    try {
      const response = await tauriFetch(this.cleanUrl, {
        method: 'POST',
        headers: { 
          ...this.headers, 
          ...this.sessionHeaders, // Пробрасываем ID сессии, если он уже получен
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify(message),
        signal: this.closeController.signal
      });

      // ИЗВЛЕЧЕНИЕ СЕССИИ: Проверяем заголовки ответа на наличие ID сессии
      const sid = response.headers.get('mcp-session-id');
      
      if (sid) {
        this.sessionHeaders['Mcp-Session-ID'] = sid;
      }

      if (!response.ok && !isInitializedNotification) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await response.json();
        
        // Игнорируем ошибку сессии только для нотификации initialized
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
      if (e.name !== 'AbortError' && this.onerror) this.onerror(e);
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
  enabled = $state(false);
  autoApproveAll = $state(true);
  isExpanded = $state(false);
  isLoading = $state(false);
  tools = $state<MCPTool[]>([]);
  error = $state<string | null>(null);
  
  workspaceId: string = '';

  private client: Client | null = null;
  public config: MCPServerConfig;
  private _initialState?: MCPServerState;
  onStateChange: () => void;

  constructor(
    config: MCPServerConfig,
    initialState?: MCPServerState,
    onStateChange?: () => void
  ) {
    this.config = config;
    this.name = config.name;
    this.url = config.url || '';
    this.headers = config.headers || {};
    this._initialState = initialState;
    this.onStateChange = onStateChange || (() => {});

    if (initialState) {
      this.autoApproveAll = initialState.autoApproveAll ?? true;
      this.isExpanded = initialState.isExpanded ?? false;
      this.enabled = initialState.enabled ?? false;
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

  getToolsForLLM() {
    if (!this.enabled) return [];
    
    return this.tools
      .filter(t => t.enabled)
      .map(t => ({
        name: `${this.name}__${t.name}`, 
        description: t.description,
        input_schema: t.inputSchema 
      }));
  }

  async callTool(toolName: string, arguments_?: any) {
    if (!this.client || !this.enabled) {
      throw new Error(`Server ${this.name} is not connected`);
    }

    try {
      return await this.client.callTool({
        name: toolName,
        arguments: arguments_
      });
    } catch (e: any) {
      console.error(`[MCP CallTool Error] ${this.name}/${toolName}:`, e);
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
    try {
      let transport: Transport;

      if (this.config.url) {
        transport = new TauriHttpTransport(this.config.url, this.headers);
      } else if (this.config.command) {
        transport = new TauriStdioTransport(
          this.config.command,
          this.config.args || [],
          this.config.env || {}
        );
      } else {
        throw new Error("Server configuration must provide either 'url' or 'command'");
      }

      this.client = new Client(
        { name: "cai-client", version: "1.0.0" },
        { 
          capabilities: {} 
        }
      );

      await this.client.connect(transport);
      
      const response = await this.client.listTools();
      
      this.tools = response.tools.map(t => {
        const savedTool = this._initialState?.tools?.[t.name];
        return {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema, 
          enabled: savedTool ? savedTool.enabled : true,
          alwaysAllow: savedTool ? savedTool.alwaysAllow : true
        };
      });
      
      this.enabled = true; 
      this.notify(); 
    } catch (e: any) {
      console.error(`[MCP Connect Error] ${this.name}:`, e);
      this.error = e.message || "Failed to connect";
      this.enabled = false;
      this.notify();
    } finally {
      this.isLoading = false;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        console.warn(`[MCP Disconnect Warning] ${this.name}:`, e);
      }
    }
    this.enabled = false;
    this.tools = [];
    this.client = null;
    this.notify();
  }

  toggle() {
    if (this.enabled) {
      this.disconnect();
    } else {
      this.connect();
    }
  }
}

/**
 * Глобальный менеджер MCP-серверов
 */
export class MCPManager {
  instances = $state<MCPServerInstance[]>([]);

  constructor() {}

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
