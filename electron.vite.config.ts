import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import path from 'node:path'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/main/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/preload/index.ts')
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [tailwindcss(), react()]
  }
})
