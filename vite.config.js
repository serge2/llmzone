import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import pkg from "./package.json" with { type: "json" };

const host = process.env.TAURI_DEV_HOST;

/** @type {import('vite').UserConfig} */
export default defineConfig({
  plugins: [sveltekit()],

  // Важно для Tauri 2
  envPrefix: ['VITE_', 'TAURI_'],

  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  
  build: {
    // Настройки для корректной работы WebView
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
