// src/lib/config.ts
import { writeTextFile, readTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appConfigDir, join } from '@tauri-apps/api/path';

export interface AppConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
}

const CONFIG_FILENAME = 'config.json';

async function getFilePath() {
  const configDir = await appConfigDir();
  return await join(configDir, CONFIG_FILENAME);
}

export async function saveConfig(config: AppConfig) {
  try {
    const configDir = await appConfigDir();
    const filePath = await getFilePath();

    // Проверяем наличие папки конфига (например, %APPDATA%/cai-app)
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

export async function loadConfig(): Promise<AppConfig | null> {
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
