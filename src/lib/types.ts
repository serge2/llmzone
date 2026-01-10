export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  text: string;
  tool_call_id?: string; 
}

export interface Chat {
  id: string;
  name: string;
  history: Message[];
}

export interface WorkspaceSettings {
  apiUrl: string;
  apiKey: string;
  modelName: string;
  systemPrompt: string;
  temperature: number;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string; 
  settings: WorkspaceSettings;
  chats: Chat[];
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  lastSelectedWorkspaceId?: string;
}