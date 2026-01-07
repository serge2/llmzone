export interface Message {
  role: 'user' | 'ai' | 'error' | 'assistant';
  text: string;
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
