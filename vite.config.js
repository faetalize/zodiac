/** @type {import('vite').UserConfig} */
export default {
    root: 'src',
    build: {
        target: 'esnext',
        outDir: '../dist',
        emptyOutDir: true,
    }
}