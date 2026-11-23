import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const rootDir = import.meta.dirname;

export default defineConfig(() => {
  return {
    root: path.resolve(rootDir, 'client'),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'serve-and-copy-src-assets',
        configureServer(server) {
          const assetsRoot = path.resolve(rootDir, 'src/assets');
          server.middlewares.use('/src/assets', (req, res, next) => {
            if (!req.url) {
              next();
              return;
            }
            const cleanUrl = req.url.split('?')[0] ?? '';
            const safeRel = path.normalize(cleanUrl).replace(/^(\.\.(\/|\\|$))+/, '');
            const target = path.resolve(assetsRoot, `.${safeRel}`);
            if (!target.startsWith(assetsRoot + path.sep) || !fs.existsSync(target)) {
              next();
              return;
            }
            if (target.endsWith('.jpg') || target.endsWith('.jpeg')) {
              res.setHeader('Content-Type', 'image/jpeg');
            } else if (target.endsWith('.png')) {
              res.setHeader('Content-Type', 'image/png');
            }
            fs.createReadStream(target).pipe(res);
          });
        },
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(rootDir, 'dist/client');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'client/src'),
        '@shared': path.resolve(rootDir, 'shared'),
      },
    },
    build: {
      outDir: path.resolve(rootDir, 'dist/client'),
      emptyOutDir: true,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
