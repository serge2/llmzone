import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { fetch } from "@tauri-apps/plugin-http";

class HttpPostTransport implements Transport {
  private _url: string;
  private _headers: Record<string, string>;
  
  public sessionId?: string;
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: any) => void;

  constructor(url: string, headers: Record<string, string>) {
    this._url = url;
    this._headers = headers;
  }

  async start() {
    return Promise.resolve();
  }

  private sanitizeSchema(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeSchema(item));
    }

    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'type' && typeof value === 'string') {
        newObj[key] = value.replace(/,$/, '').trim();
      } else {
        newObj[key] = this.sanitizeSchema(value);
      }
    }
    return newObj;
  }

  async send(message: any) {
    try {
      const requestHeaders: Record<string, string> = {
        ...this._headers,
        'Content-Type': 'application/json',
      };

      if (this.sessionId) {
        requestHeaders['Mcp-Session-Id'] = this.sessionId;
      }

      const response = await fetch(this._url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const sId = response.headers.get('Mcp-Session-Id');
      if (sId) {
        this.sessionId = sId;
      }

      let data = await response.json();

      if (data?.result?.tools) {
        data.result.tools = this.sanitizeSchema(data.result.tools);
      }

      if (this.onmessage && data) {
        this.onmessage(data);
      }
    } catch (e: any) {
      console.error("[MCP Transport Error]", e);
      if (this.onerror) this.onerror(e);
    }
  }

  async close() {
    this.sessionId = undefined;
    if (this.onclose) this.onclose();
  }
}

export interface MCPTool {
  name: string;
  description?: string;
  enabled: boolean;
  alwaysAllow: boolean;
  inputSchema?: any; // Схема параметров для LLM
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
  
  private client: Client | null = null;
  private _initialState?: MCPServerState;
  onStateChange: () => void;

  constructor(
    name: string, 
    url: string, 
    headers: Record<string, string> = {}, 
    initialState?: MCPServerState,
    onStateChange?: () => void
  ) {
    this.name = name;
    this.url = url;
    this.headers = headers;
    this._initialState = initialState;
    this.onStateChange = onStateChange || (() => {});

    if (initialState) {
      this.autoApproveAll = initialState.autoApproveAll ?? true;
      this.isExpanded = initialState.isExpanded ?? false;
      this.enabled = initialState.enabled ?? false;
      // Мы не вызываем connect() прямо в конструкторе, 
      // чтобы избежать гонок при инициализации приложения.
      // Вызов connect() теперь делает +page.svelte после сборки списка.
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
   * Возвращает список инструментов в формате для LLM (интеграция с Chat API)
   */
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

  /**
   * Вызывает конкретный инструмент на этом сервере
   */
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
    if (this.isLoading) return; // Предотвращаем двойной коннект
    
    this.isLoading = true;
    this.error = null;
    try {
      const transport = new HttpPostTransport(this.url, this.headers);

      this.client = new Client(
        { name: "cai-client", version: "1.0.0" },
        { capabilities: {} }
      );

      await this.client.connect(transport);
      
      const response = await this.client.listTools();
      
      // Мапим инструменты, сохраняя пользовательские настройки из _initialState если они есть
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
      
      this.enabled = true; // Устанавливаем статус ДО уведомления
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
    // Важно: меняем состояние enabled здесь и запускаем процесс,
    // либо полагаемся на connect/disconnect, которые сами вызовут notify
    if (this.enabled) {
      this.disconnect();
    } else {
      this.connect();
    }
  }
}
