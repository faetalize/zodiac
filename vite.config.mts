
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    plugins: [
        basicSsl(),
        tailwindcss(),
    ],
    build: {
        target: 'esnext',
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions:{
            input: {
                main: './src/index.html',
                privacy: './src/privacy-policy.html',
                terms: './src/terms-of-service.html'
            }
        }
    }
})