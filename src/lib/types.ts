export type InspectorTab = 'context' | 'model' | 'tools';

export interface GlobalConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
}

export interface MCPToolState {
  enabled: boolean;
  alwaysAllow: boolean;
}

export interface MCPServerState {
  enabled: boolean;
  autoApproveAll: boolean;
  isExpanded: boolean;
  tools: Record<string, {
    enabled: boolean;
    alwaysAllow: boolean;
  }>;
}

export interface WorkspaceSettings {
  lastActiveTab?: InspectorTab;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
  mcpConfig?: string;
  mcpStates?: Record<string, MCPServerState>;
}

export interface Chat {
  id: string;
  name: string;
  history: Message[];
  isGenerating?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  settings: WorkspaceSettings;
  chats: Chat[];
}

// --- ОБНОВЛЕННАЯ СТРУКТУРА СООБЩЕНИЙ ---

export interface ToolCall {
  id: string;            // Уникальный ID вызова от LLM
  name: string;          // Имя вида "server__tool"
  arguments: any;        // Распаршенные аргументы (объект)
}

export interface ToolResult {
  tool_call_id: string;  // Ссылка на ID вызова
  content: string;       // Результат работы MCP сервера (JSON строка)
  isError?: boolean;     // Флаг ошибки выполнения
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  tool_calls?: ToolCall[];   // Если ассистент хочет вызвать инструменты
  tool_result?: ToolResult; // Если это сообщение-ответ от инструмента
  error?: string;
}

// ---------------------------------------

export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  lastSelectedWorkspaceId: string;
  workspaces: Omit<Workspace, 'chats'>[];
  globalConfig?: GlobalConfig;
}
