import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20 * 1024,
          maxSize: 420 * 1024,
          groups: [
            {
              name: 'editor-engine',
              test: /node_modules[\\/](@codemirror|@lezer|crelt|style-mod|w3c-keyname)/,
              priority: 10,
              maxSize: 360 * 1024,
              includeDependenciesRecursively: false
            }
          ]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:8080'
    }
  }
});
