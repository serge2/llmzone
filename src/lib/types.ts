// types.ts
export type InspectorTab = 'context' | 'model' | 'tools' ;

// Добавляем типы поддерживаемых провайдеров
export type ProviderType = 'openai' | 'lm-studio' | 'openrouter' | 'anthropic' | 'custom';

export interface Attachment {
  id: string;              // Уникальный ID (UUID)
  name: string;            // Оригинальное имя файла (например, "report.pdf")
  size: number;            // Размер в байтах
  mimeType: string;        // MIME-тип (image/png, application/pdf, и т.д.)
  base64?: string;         // Содержимое для Vision или мелких файлов
  path?: string;           // Локальный путь (для обработки через Tauri на бэкенде)
  type: 'image' | 'document' | 'archive' | 'audio' | 'video' | 'other'; // Категория файла для удобства обработки
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

  
  temperature?: number;             // OpenAI, OpenRouter, LM Studio
  temperatureEnabled?: boolean;
  maxCompletionTokens?: number;     // OpenAI, OpenRouter, LM Studio (max_output_tokens)
  maxCompletionTokensEnabled?: boolean;
  maxTokens?: number;               // OpenRouter
  maxTokensEnabled?: boolean;
  topP?: number;                    // OpenAI, OpenRouter, LM Studio
  topPEnabled?: boolean;
  frequencyPenalty?: number;        // OpenAI, OpenRouter
  frequencyPenaltyEnabled?: boolean;
  presencePenalty?: number;         // OpenAI, OpenRouter
  presencePenaltyEnabled?: boolean;
  seed?: number;                    // OpenAI, OpenRouter
  seedEnabled?: boolean;
  topK?: number;                    // LM Studio
  topKEnabled?: boolean;
  minP?: number;                    // LM Studio 
  minPEnabled?: boolean;
  repeatPenalty?: number;           // LM Studio
  repeatPenaltyEnabled?: boolean;
  contextLength?: number;           // LM Studio
  contextLengthEnabled?: boolean;
  // Параметры Рассуждений (Reasoning)
  // OpenAI использует reasoning_effort
  // OpenRouter использует reasoning с вложенным effort
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'; // OpenAI, OpenRouter
  reasoningEffortEnabled?: boolean;
  verbosity?: 'low' | 'medium' | 'high'; // OpenAI
  verbosityEnabled?: boolean;
  // LM Studio использует reasoning (согласно их доке v1)
  reasoning?: 'off' | 'low' | 'medium' | 'high' | 'on'; // LM Studio
  reasoningEnabled?: boolean;

  mcpConfig?: string;
  mcpTimeout?: number;
  mcpStates?: Record<string, MCPServerState>;
  toolsLoopLimitEnabled?: boolean;
  toolsMaxIterations?: number;
  autoRenameEnabled?: boolean;
  providerType?: ProviderType; // НОВОЕ: Тип провайдера для адаптации API
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
  response_id?: string;
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
}
