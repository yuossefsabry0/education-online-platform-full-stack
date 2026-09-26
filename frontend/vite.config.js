import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// NOTE: port 3000 matches the backend's CORS allow-list
// (CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000).
// Running on any other origin requires adding that origin to the
// backend CORS_ORIGINS — no backend change is made from here.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
  },
  preview: {
    port: 3000,
  },
})
