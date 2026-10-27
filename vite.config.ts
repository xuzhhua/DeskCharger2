import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 期望固定的 dev 端口与严格的 CORS 限制
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "chrome105",
    // 生产构建不输出 sourcemap（否则 2.3MB 的 .map 会随安装包发布）；
    // 需要调试产物时用 `vite build --mode debug`
    sourcemap: mode !== "production",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
}));
