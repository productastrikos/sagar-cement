// Self-hosted brand fonts (§5.8) — imported instead of the Google Fonts @import
// so the demo runs on an offline laptop. theme.css is imported before anything else.
import '@fontsource/lexend-deca/400.css';
import '@fontsource/lexend-deca/600.css';
import '@fontsource/lexend-deca/700.css';
import '@fontsource/lato/300.css';
import '@fontsource/lato/400.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/900.css';
import './styles/theme.css';
import 'leaflet/dist/leaflet.css';
import './styles/additions.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initTheme } from './lib/theme';

initTheme();
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
