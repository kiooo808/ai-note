import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'; // 👈 修正为本地实际包含的 react 基础插件

export default defineConfig({
  plugins: [react()],
  base: '/connected-ideas/', // 👈 对应你建立的仓库路径
});
