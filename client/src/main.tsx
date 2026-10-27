/**
 * @file main.tsx
 * @description React 18 Application Entry Point for CascadeOS FinOps Suite.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { CascadeStateProvider } from '@/context/CascadeStateContext';
import App from '@/App';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CascadeStateProvider>
      <App />
    </CascadeStateProvider>
  </React.StrictMode>
);
