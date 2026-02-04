import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  // --- DEBUG: 檢查 API Key 是否讀取成功 ---
  if (env.API_KEY) {
    console.log('\n\x1b[32m✅ 成功讀取 API_KEY！\x1b[0m');
    console.log(`金鑰前五碼: ${env.API_KEY.slice(0, 5)}...`);
    console.log('請在打包後的 JS 檔案中搜尋這五碼，應該就能找到。\n');
  } else {
    console.log('\n\x1b[31m❌ 警告：未讀取到 API_KEY！\x1b[0m');
    console.log('請確認 .env 檔案是否存在於專案根目錄，且內容格式正確 (API_KEY=...)。\n');
  }
  // ----------------------------------------

  return {
    plugins: [react()],
    // IMPORTANT: Set base to './' so assets load correctly on GitHub Pages subdirectories
    base: './', 
    define: {
      // Shims process.env.API_KEY for the browser build
      'process.env.API_KEY': JSON.stringify(env.API_KEY) 
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    }
  };
});