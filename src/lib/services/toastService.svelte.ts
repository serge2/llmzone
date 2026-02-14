// src/lib/services/toastService.svelte.ts
export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
}

class ToastService {
  messages = $state<Toast[]>([]);

  show(message: string, type: 'error' | 'success' | 'info' = 'error') {
    const id = this.uniqueId();
    this.messages.push({ id, message, type });

    // Автоматическое удаление через 10 секунд
    setTimeout(() => {
      this.messages = this.messages.filter(t => t.id !== id);
    }, 10000);
  }

  remove(id: number) {
    this.messages = this.messages.filter(t => t.id !== id);
  }

  private uniqueId() {
    return Date.now()*1000 + Math.floor(Math.random() * 1000);
  }
}

export const toastService = new ToastService();

