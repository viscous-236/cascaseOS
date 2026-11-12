import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Bryntum Gantt and AG Studio ship as monolithic trial SDKs. They are
    // isolated into cached vendor chunks; the remaining route chunks are small.
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        // Keep the monolithic trial SDKs in their own cacheable vendor chunks so
        // route chunks and the application shell stay small.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/@bryntum/')) return 'vendor-bryntum';
          if (
            id.includes('/ag-studio') ||
            id.includes('/ag-grid') ||
            id.includes('/ag-charts')
          ) {
            return 'vendor-ag-studio';
          }
          if (id.includes('/@paypal/') || id.includes('/paypal-js')) return 'vendor-paypal';
          if (id.includes('/three/') || id.includes('/@react-three/')) return 'vendor-three';
          if (id.includes('/framer-motion/')) return 'vendor-motion';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@bryntum/gantt', '@bryntum/gantt-react', '@paypal/react-paypal-js'],
  },
});
