// src/lib/config.ts
import { writeTextFile, readTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appConfigDir, join } from '@tauri-apps/api/path';
import type { AppSettings } from './types'; // Импортируем актуальный интерфейс

const CONFIG_FILENAME = 'config.json';

async function getFilePath() {
  const configDir = await appConfigDir();
  return await join(configDir, CONFIG_FILENAME);
}

// Теперь функция принимает AppSettings, который включает в себя воркспейсы и тему
export async function saveConfig(config: AppSettings) {
  try {
    const configDir = await appConfigDir();
    const filePath = await getFilePath();

    if (!(await exists(configDir))) {
      await mkdir(configDir, { recursive: true });
    }

    await writeTextFile(filePath, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Save config error:", error);
    return false;
  }
}

// Возвращаем AppSettings, чтобы +page.svelte видел правильную структуру
export async function loadConfig(): Promise<AppSettings | null> {
  try {
    const filePath = await getFilePath();
    if (await exists(filePath)) {
      const content = await readTextFile(filePath);
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Load config error:", error);
  }
  return null;
}