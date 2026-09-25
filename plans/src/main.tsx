import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/gelasio/400.css';
import '@fontsource/gelasio/700.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/700.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
