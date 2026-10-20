import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import ShopContextProvider from './context/ShopContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ShopContextProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1E293B', color: '#fff', borderRadius: '12px', fontSize: '14px' },
            success: { iconTheme: { primary: '#F59E0B', secondary: '#fff' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
          }}
        />
      </ShopContextProvider>
    </BrowserRouter>
  </React.StrictMode>
);