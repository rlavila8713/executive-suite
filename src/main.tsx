import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrateDexieToApi } from './lib/backup';

async function bootstrap() {
  try {
    const migrated = await migrateDexieToApi();
    if (migrated) {
      console.info('Migrated local IndexedDB data to API server.');
    }
  } catch (err) {
    console.warn('IndexedDB migration skipped', err);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
