// src/lib/services/toastService.svelte.ts
export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
}

class ToastService {
  messages = $state<Toast[]>([]);

  show(message: string, type: 'error' | 'success' | 'info' = 'error') {
    const id = Date.now();
    this.messages.push({ id, message, type });

    // Автоматическое удаление через 5 секунд
    setTimeout(() => {
      this.messages = this.messages.filter(t => t.id !== id);
    }, 5000);
  }

  remove(id: number) {
    this.messages = this.messages.filter(t => t.id !== id);
  }
}

export const toastService = new ToastService();
