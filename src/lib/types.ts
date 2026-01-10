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

export interface Workspace {
  id: string;
  name: string;
  chats: Chat[];
}

export interface Settings {
  apiUrl: string;
  apiKey: string;
  modelName: string;
}
