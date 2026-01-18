import { MCPServerInstance } from './manager.svelte';

// Карта для хранения: "ID_ВОРКСПЕЙСА:ИМЯ_СЕРВЕРА" => Инстанс
const instancesCache = new Map<string, MCPServerInstance>();

export const mcpManager = {
  getOrCreate(wsId: string, name: string, url: string, headers: any, initialState: any, onSave: () => void) {
    const key = `${wsId}:${name}`;
    if (!instancesCache.has(key)) {
      const instance = new MCPServerInstance(name, url, headers, initialState, onSave);
      instancesCache.set(key, instance);
      // Если в конфиге был включен — коннектим
      if (initialState?.enabled) instance.connect();
    }
    return instancesCache.get(key)!;
  },

  // Получить все инстансы конкретного воркспейса (для UI и для ChatService)
  getForWorkspace(wsId: string): MCPServerInstance[] {
    const result: MCPServerInstance[] = [];
    for (const [key, instance] of instancesCache.entries()) {
      if (key.startsWith(`${wsId}:`)) {
        result.push(instance);
      }
    }
    return result;
  },

  // Очистка при удалении воркспейса
  removeWorkspace(wsId: string) {
    for (const [key, instance] of instancesCache.entries()) {
      if (key.startsWith(`${wsId}:`)) {
        instance.disconnect();
        instancesCache.delete(key);
      }
    }
  }
};
