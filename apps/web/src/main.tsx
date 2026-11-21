import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles/tokens.css';
import './styles/print.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ToastProvider } from './components/ui';
import { AuthProvider } from './lib/auth';
import { criarQueryClient } from './lib/query';

const cliente = criarQueryClient();

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
