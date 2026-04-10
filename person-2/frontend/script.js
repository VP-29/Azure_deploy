import { isLoggedIn } from './auth.js';
import { renderLogin } from './login.js';
import { renderDashboard } from './dashboard.js';

async function startApp() {
  console.log('startApp running');

  try {
    const loggedIn = await isLoggedIn();
    console.log('loggedIn =', loggedIn);

    if (loggedIn) {
      console.log('rendering dashboard');
      await renderDashboard();
    } else {
      console.log('rendering login');
      renderLogin();
    }
  } catch (error) {
    console.error('Startup error:', error);
    renderLogin();
  }
}

startApp();