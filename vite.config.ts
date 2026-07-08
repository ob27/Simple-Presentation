import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/simple-presentation/',
  build: {
    outDir: '/users/tom/oestler/client/dist/simple-presentation',
    emptyOutDir: true,
  },
})
