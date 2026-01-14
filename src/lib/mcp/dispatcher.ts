import type { MCPServerInstance } from './manager.svelte';

export interface ToolMapping {
  server: MCPServerInstance;
  originalName: string;
}

export class MCPDispatcher {
  // Наша "Витрина" (Registry)
  private registry = new Map<string, ToolMapping>();

  /**
   * Шаг 1-4: Собирает инструменты и готовит их для LLM
   */
  generateToolList(serverInstances: MCPServerInstance[]) {
    this.registry.clear();
    const toolsForLLM = [];

    for (const server of serverInstances) {
      if (!server.enabled) continue;

      for (const tool of server.tools) {
        if (!tool.enabled) continue;

        // Генерация "красивого" имени для LLM
        let displayName = `${server.name}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // Шаг 4: Разрешение коллизий
        let counter = 1;
        let finalName = displayName;
        while (this.registry.has(finalName)) {
          finalName = `${displayName}_${counter}`;
          counter++;
        }

        // Шаг 3: Маппинг
        this.registry.set(finalName, {
          server: server,
          originalName: tool.name
        });

        toolsForLLM.push({
          name: finalName,
          description: tool.description,
          input_schema: tool.inputSchema
        });
      }
    }

    return toolsForLLM;
  }

  /**
   * Шаг 5: Обратный вызов
   */
  async callTool(llmToolName: string, args: any) {
    const mapping = this.registry.get(llmToolName);
    if (!mapping) {
      throw new Error(`Tool ${llmToolName} not found in current session registry`);
    }

    return await mapping.server.callTool(mapping.originalName, args);
  }
}