import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectManager } from './src/server/projectManager.ts';
import { SettingsManager } from './src/server/settingsManager.ts';
import { QueueOrchestrator } from './src/server/queueOrchestrator.ts';
import { createApiRouter } from './src/server/apiRouter.ts';
import { defaultChromeSessionManager } from './src/server/browser/chromeSessionManager.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Core Services
  const projectManager = new ProjectManager(path.resolve(__dirname, 'project-data'));
  const settingsManager = new SettingsManager(path.resolve(__dirname, 'project-data'), __dirname);
  const queueOrchestrator = new QueueOrchestrator(projectManager, settingsManager);

  // Mount API Router
  app.use(
    '/api',
    createApiRouter(queueOrchestrator, projectManager, defaultChromeSessionManager, settingsManager)
  );

  // Serve static assets or mount Vite middleware in development
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`  AutoGenImg Studio (AI Image Workflow Studio)`);
    console.log(`  Local server running at: http://localhost:${PORT}`);
    console.log(`  Mode: ${isProd ? 'Production' : 'Development'}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AutoGenImg Studio server:', err);
  process.exit(1);
});
