export interface GlobalConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
}

export interface WorkspaceSettings {
  apiUrl: string;
  apiKey: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
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

export interface Message {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  lastSelectedWorkspaceId: string;
  workspaces: Omit<Workspace, 'chats'>[];
  globalConfig?: GlobalConfig; // Новое поле
}