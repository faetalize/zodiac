/** @type {import('vite').UserConfig} */

export default {
    root: 'src',
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