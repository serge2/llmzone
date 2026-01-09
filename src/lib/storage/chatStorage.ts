import { writeTextFile, readTextFile, mkdir, exists, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { Workspace } from '$lib/types';

const DATA_DIR = 'cai';
const CHATS_FILE = 'cai/chats.json'; // Относительный путь от корня AppData

export async function loadChats(): Promise<Workspace[] | null> {
  try {
    // 1. Проверяем существование файла (относительно AppData)
    const fileExists = await exists(CHATS_FILE, { baseDir: BaseDirectory.AppData });

    if (!fileExists) {
      return null;
    }

    // 2. Читаем файл
    const raw = await readTextFile(CHATS_FILE, { baseDir: BaseDirectory.AppData });
    return JSON.parse(raw) as Workspace[];
  } catch (err) {
    console.error('loadChats error:', err);
    return null;
  }
}

export async function saveChats(workspaces: Workspace[]) {
  try {
    // 1. Создаем папку cai (если её нет)
    await mkdir(DATA_DIR, { 
      baseDir: BaseDirectory.AppData, 
      recursive: true 
    });

    // 2. Пишем файл
    await writeTextFile(
      CHATS_FILE,
      JSON.stringify(workspaces, null, 2),
      { baseDir: BaseDirectory.AppData }
    );
  } catch (err) {
    console.error('saveChats error:', err);
  }
}