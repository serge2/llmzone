// src/lib/storage/chatStorage.ts
import { writeTextFile, readTextFile, mkdir, exists, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import type { Chat, Message } from '$lib/types';

const BASE_DIR = 'cai/workspaces';

// Вспомогательные функции для путей
const getWorkspaceDir = (wsId: string) => `${BASE_DIR}/${wsId}`;
// Файл метаданных (список чатов без тяжелой истории)
const getWorkspaceFilePath = (wsId: string) => `${BASE_DIR}/${wsId}/chats.json`;
// Путь к папке конкретного чата
const getChatDir = (wsId: string, chatId: string) => `${BASE_DIR}/${wsId}/chats/${chatId}`;
// Файл истории конкретного чата
const getChatHistoryPath = (wsId: string, chatId: string) => `${BASE_DIR}/${wsId}/chats/${chatId}/history.json`;

/**
 * Загружает список чатов для конкретного воркспейса (метаданные без истории)
 */
export async function loadChatsForWorkspace(wsId: string): Promise<Chat[] | null> {
  try {
    const filePath = getWorkspaceFilePath(wsId);
    const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppData });

    if (!fileExists) {
      return null;
    }

    const raw = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
    const chats = JSON.parse(raw) as Chat[];
    
    // При загрузке метаданных гарантируем, что история пуста, 
    // она будет подгружена отдельно через loadChatHistory
    return chats.map(chat => ({ ...chat, history: [] }));
  } catch (err) {
    console.error(`loadChats error for workspace ${wsId}:`, err);
    return null;
  }
}

/**
 * Загружает историю сообщений для конкретного чата
 */
export async function loadChatHistory(wsId: string, chatId: string): Promise<Message[]> {
  try {
    const filePath = getChatHistoryPath(wsId, chatId);
    const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppData });

    if (!fileExists) {
      return [];
    }

    const raw = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
    return JSON.parse(raw) as Message[];
  } catch (err) {
    console.error(`loadChatHistory error for chat ${chatId}:`, err);
    return [];
  }
}

/**
 * Сохраняет чаты воркспейса: метаданные всех чатов и историю текущего активного чата
 */
export async function saveChatsForWorkspace(wsId: string, chats: Chat[]) {
  try {
    const dirPath = getWorkspaceDir(wsId);

    // Создаем базу воркспейса
    await mkdir(dirPath, { 
      baseDir: BaseDirectory.AppData, 
      recursive: true 
    });

    // 1. Сохраняем метаданные всех чатов (без истории)
    const metadata = chats.map(({ history, isGenerating, ...meta }) => meta);
    await writeTextFile(
      getWorkspaceFilePath(wsId),
      JSON.stringify(metadata, null, 2),
      { baseDir: BaseDirectory.AppData }
    );

    // 2. Сохраняем историю каждого чата в его персональную папку
    for (const chat of chats) {
      const chatDir = getChatDir(wsId, chat.id);
      
      // Создаем структуру папки чата (с заделом под вложения/проекты)
      await mkdir(`${chatDir}/attachments`, { 
        baseDir: BaseDirectory.AppData, 
        recursive: true 
      });

      // Пишем историю только если она есть (чтобы не затереть существующую при ленивой загрузке)
      if (chat.history && chat.history.length > 0) {
        await writeTextFile(
          getChatHistoryPath(wsId, chat.id),
          JSON.stringify(chat.history, null, 2),
          { baseDir: BaseDirectory.AppData }
        );
      }
    }
  } catch (err) {
    console.error(`saveChats error for workspace ${wsId}:`, err);
  }
}

/**
 * Удаляет папку конкретного чата
 */
export async function deleteChatFolder(wsId: string, chatId: string) {
  try {
    const chatDir = getChatDir(wsId, chatId);
    const chatExists = await exists(chatDir, { baseDir: BaseDirectory.AppData });
    
    if (chatExists) {
      await remove(chatDir, { 
        baseDir: BaseDirectory.AppData, 
        recursive: true 
      });
    }
  } catch (err) {
    console.error(`deleteChatFolder error for ${chatId}:`, err);
  }
}

/**
 * Удаляет всю папку воркспейса при его удалении
 */
export async function deleteWorkspaceFolder(wsId: string) {
  try {
    const dirPath = getWorkspaceDir(wsId);
    const dirExists = await exists(dirPath, { baseDir: BaseDirectory.AppData });
    
    if (dirExists) {
      // В Tauri 2 используем remove вместо removeDir
      await remove(dirPath, { 
        baseDir: BaseDirectory.AppData, 
        recursive: true 
      });
    }
  } catch (err) {
    console.error(`deleteWorkspaceFolder error for ${wsId}:`, err);
  }
}
