import './styles/main.css';
import './services/googleCalendar.ts';
import { App } from './app.js';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
