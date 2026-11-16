import './lib/polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NowProvider } from './lib/now';
import './styles/index.css';

// Safety net: if the entry module is ever evaluated twice (same file loaded
// under two URLs), do not mount a second app over the first one.
const started = window as unknown as { __ULTIMATE_UI_STARTED__?: boolean };
if (started.__ULTIMATE_UI_STARTED__) {
  console.warn('[ultimate-ui] entry evaluated twice; skipping second mount');
} else {
  started.__ULTIMATE_UI_STARTED__ = true;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <NowProvider>
            <App />
          </NowProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
