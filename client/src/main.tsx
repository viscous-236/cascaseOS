/**
 * @file main.tsx
 * @description React 18 Application Entry Point for CascadeOS FinOps Suite.
 */

import '@/utils/bryntumPatch';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CascadeStateProvider } from '@/context/CascadeStateContext';
import { Toaster } from 'sonner';
import App from '@/App';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CascadeStateProvider>
      <App />
      <Toaster position="bottom-right" richColors theme="dark" closeButton />
    </CascadeStateProvider>
  </React.StrictMode>
);
