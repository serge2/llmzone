// src/lib/services/adapters/factory.ts
import type { ProviderType } from '$lib/types';
import type { ChatAdapter } from './interface';
import { OpenAIAdapter } from './openaiAdapter';
import { LmStudioAdapter } from './lmStudioAdapter';
import { OpenRouterAdapter } from './openRouterAdapter';

/**
 * Фабрика для управления и получения адаптеров провайдеров
 */
export class ProviderFactory {
  private static adapters: Record<string, ChatAdapter> = {
    'openai': new OpenAIAdapter(),
    'lm-studio': new LmStudioAdapter(),
    'openrouter': new OpenRouterAdapter(),
    'custom': new OpenAIAdapter()
  };

  /**
   * Возвращает адаптер по типу провайдера.
   */
  static getAdapter(providerType?: ProviderType): ChatAdapter {
    const type = providerType || 'openai';
    return this.adapters[type] || this.adapters['openai'];
  }

  /**
   * Проверка на LM Studio
   */
  static isNativeLMStudio(providerType?: ProviderType): boolean {
    return providerType === 'lm-studio';
  }
}
