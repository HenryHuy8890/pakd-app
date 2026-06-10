import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ErrorBoundary } from './components/pin';
import { App } from './App';

createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
