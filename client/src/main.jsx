import React from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext.jsx';
import { router } from './router.jsx';
import { BrandLoader } from './ui/BrandLoader.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} fallbackElement={<BrandLoader />} />
    </AuthProvider>
  </React.StrictMode>
);
