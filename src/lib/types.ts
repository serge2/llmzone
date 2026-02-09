// types.ts
export type InspectorTab = 'context' | 'model' | 'tools' ;

export interface Attachment {
  id: string;              // Уникальный ID (UUID)
  name: string;            // Оригинальное имя файла (например, "report.pdf")
  size: number;            // Размер в байтах
  mimeType: string;        // MIME-тип (image/png, application/pdf, и т.д.)
  base64?: string;         // Содержимое для Vision или мелких файлов
  path?: string;           // Локальный путь (для обработки через Tauri на бэкенде)
  type: 'image' | 'document' | 'archive' | 'other';
}

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
  followFirstMessage?: boolean;
  includeMcpInstructions?: boolean;
  temperature: number;
  mcpConfig?: string;
  mcpTimeout?: number;
  mcpStates?: Record<string, MCPServerState>;
  toolsLoopLimitEnabled?: boolean;
  toolsMaxIterations?: number;
  autoRenameEnabled?: boolean;
}

export interface Chat {
  id: string;
  name: string;
  history: Message[];
  isGenerating?: boolean;
  is_untitled?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  settings: WorkspaceSettings;
  chats: Chat[];
}

export interface ToolCall {
  id: string;            // Уникальный ID вызова от LLM
  name: string;          // Имя вида "server__tool"
  arguments: any;        // Распаршенные аргументы (объект)
  raw_arguments?: string; // Еще не распаршенные аргументы
  approvalStatus?: 'pending' | 'approved' | 'rejected';
}

export interface ToolResult {
  tool_call_id: string;  // Ссылка на ID вызова
  content: string;       // Результат работы MCP сервера (JSON строка)
  isError?: boolean;     // Флаг ошибки выполнения
}

export interface Message {
  id: string;           // НОВОЕ: Уникальный ID сообщения
  role: 'user' | 'assistant' | 'system' | 'tool';
  text: string;
  reasoning?: string;
  tool_calls?: ToolCall[];   // Если ассистент хочет вызвать инструменты
  tool_result?: ToolResult; // Если это сообщение-ответ от инструмента
  attachments?: Attachment[]; // Универсальный массив вложений
  error?: string;
  requiresLimitExtension?: boolean;
  usage?: {   // Информация об использованных токенах из последнего ответа LLM ('assistant')
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------

export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  language: 'ru' | 'en';
  lastSelectedWorkspaceId: string;
  workspaces: Omit<Workspace, 'chats'>[];
  globalConfig?: GlobalConfig;
}
