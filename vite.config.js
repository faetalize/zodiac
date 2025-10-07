/** @type {import('vite').UserConfig} */
import basicSsl from '@vitejs/plugin-basic-ssl';
import { server } from 'typescript';

export default {
    root: 'src',
    plugins: [
        basicSsl(),
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
}