import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tensorflow') || id.includes('@tensorflow-models')) return 'vendor-tensorflow';
          if (id.includes('read-excel-file') || id.includes('write-excel-file')) return 'vendor-spreadsheets';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-react';
          if (id.includes('axios') || id.includes('socket.io')) return 'vendor-network';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
});
