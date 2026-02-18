// src/lib/utils/rustFetch.ts
/*
 * * This is a custom fetch wrapper designed to replace @tauri-apps/plugin-http 
 * for streaming operations.
 * * WHY: 
 * Standard Tauri/Browser fetch often fails to physically close the underlying 
 * TCP connection when an AbortSignal is triggered. This leaves the LLM server 
 * (like LM Studio) generating tokens in the background even after the UI 
 * "stops" the request.
 * * HOW:
 * It offloads the network request to a custom Rust command (`stream_fetch`).
 * When aborted, it explicitly triggers `abort_stream` in Rust, which 
 * immediately drops the connection at the OS level.
 * * INTERFACE:
 * Implements a standard Web API 'Response' and 'ReadableStream' interface 
 * to ensure drop-in compatibility with existing chat services and adapters.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export async function rustFetch(url: string, options: any = {}): Promise<Response> {
  const requestId = crypto.randomUUID();
  const abortSignal = options.signal;
  
  let onResponseStarted: (status: number) => void;
  let onResponseError: (err: Error) => void;

  // Промис для ожидания начала ответа (статус-кода)
  const responseStartedPromise = new Promise<number>((resolve, reject) => {
    onResponseStarted = resolve;
    onResponseError = reject;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const unlisten = await listen('stream-data', (event: any) => {
        const data = event.payload;
        if (data.id !== requestId) return;

        // 1. Обработка статус-кода (самое первое событие)
        if (data.status && onResponseStarted) {
          onResponseStarted(data.status);
        }

        // 2. Ошибки
        if (data.error) {
          const error = new Error(data.error);
          if (onResponseError) onResponseError(error);
          controller.error(error);
          unlisten();
          return;
        }

        // 3. Завершение
        if (data.done) {
          controller.close();
          unlisten();
          return;
        }

        // 4. Данные
        if (data.chunk) {
          controller.enqueue(new TextEncoder().encode(data.chunk));
        }
      });

      // Логика отмены
      if (abortSignal) {
        if (abortSignal.aborted) {
          invoke('abort_stream', { requestId });
          unlisten();
          return;
        }
        abortSignal.addEventListener('abort', () => {
          invoke('abort_stream', { requestId });
          unlisten();
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }

      // Запуск в Rust
      try {
        await invoke('stream_fetch', {
          requestId,
          payload: {
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body ? JSON.parse(options.body) : null
          }
        });
      } catch (e: any) {
        if (onResponseError) onResponseError(new Error(e));
        controller.error(e);
        unlisten();
      }
    }
  });

  // Ждем получения статуса ответа от Rust
  const status = await responseStartedPromise;

  return {
    ok: status >= 200 && status < 300,
    status: status,
    statusText: status === 200 ? 'OK' : 'Error',
    body: stream,
    // Минимальные заглушки
    headers: new Headers(),
    json: async () => ({}),
    text: async () => ""
  } as Response;
}
