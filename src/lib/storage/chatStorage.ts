import { writeTextFile, readTextFile, mkdir, exists, BaseDirectory, remove } from '@tauri-apps/plugin-fs';
import type { Chat } from '$lib/types';

const BASE_DIR = 'cai/workspaces';

// Вспомогательные функции для путей
const getWorkspaceDir = (wsId: string) => `${BASE_DIR}/${wsId}`;
const getWorkspaceFilePath = (wsId: string) => `${BASE_DIR}/${wsId}/chats.json`;

/**
 * Загружает чаты для конкретного воркспейса из его персональной папки
 */
export async function loadChatsForWorkspace(wsId: string): Promise<Chat[] | null> {
  try {
    const filePath = getWorkspaceFilePath(wsId);
    const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppData });

    if (!fileExists) {
      return null;
    }

    const raw = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
    return JSON.parse(raw) as Chat[];
  } catch (err) {
    console.error(`loadChats error for workspace ${wsId}:`, err);
    return null;
  }
}

/**
 * Сохраняет чаты воркспейса в папку с его ID
 */
export async function saveChatsForWorkspace(wsId: string, chats: Chat[]) {
  try {
    const dirPath = getWorkspaceDir(wsId);

    // Создаем цепочку папок (cai/workspaces/ID) если их нет
    await mkdir(dirPath, { 
      baseDir: BaseDirectory.AppData, 
      recursive: true 
    });

    await writeTextFile(
      getWorkspaceFilePath(wsId),
      JSON.stringify(chats, null, 2),
      { baseDir: BaseDirectory.AppData }
    );
  } catch (err) {
    console.error(`saveChats error for workspace ${wsId}:`, err);
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
