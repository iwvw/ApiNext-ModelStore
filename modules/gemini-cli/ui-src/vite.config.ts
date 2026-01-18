import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.tsx'),
            name: 'GeminiCLIClient',
            fileName: () => 'index.js',
            formats: ['cjs']
        },
        rollupOptions: {
            external: [
                'react',
                'react-dom',
                'lucide-react',
                'react/jsx-runtime',
                '@/components/ui/button',
                '@/components/ui/input',
                '@/components/ui/card',
                '@/components/ui/badge',
                '@/components/ui/table'
            ],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'lucide-react': 'LucideIcons'
                },
                exports: 'named'
            }
        },
        outDir: '../client',
        emptyOutDir: false
    },
    define: {
        'process.env': {}
    }
});
