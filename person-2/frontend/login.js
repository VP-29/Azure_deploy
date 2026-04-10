import { loginUser, registerUser, googleLogin, GOOGLE_CLIENT_ID } from './auth.js';
import { renderDashboard } from './dashboard.js';

export function renderLogin() {
  const app = document.getElementById('app');
  console.log('real renderLogin called', app);

  app.innerHTML = `
    <div class="page auth-page">
      <div class="auth-card">
        <h1>Cloud Dashboard</h1>
        <p class="subtitle">Register or login to continue</p>

        <p id="authMessage" class="auth-message"></p>

        <div class="auth-sections">
          <form id="registerForm" class="auth-form">
            <h2>Register</h2>
            <input id="registerName" type="text" placeholder="Full name" required />
            <input id="registerEmail" type="email" placeholder="Email" required />
            <input id="registerPassword" type="password" placeholder="Password" required />
            <button type="submit" class="primary-btn">Register</button>
          </form>

          <form id="loginForm" class="auth-form">
            <h2>Login</h2>
            <input id="loginEmail" type="email" placeholder="Email" required />
            <input id="loginPassword" type="password" placeholder="Password" required />
            <button type="submit" class="secondary-btn">Login</button>
          </form>

          <div class="oauth-section">
            <p class="oauth-label">Or continue with Google</p>
            <div id="googleSignInBtn"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  const authMessage = document.getElementById('authMessage');

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      authMessage.textContent = 'Registering...';
      const name = document.getElementById('registerName').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const password = document.getElementById('registerPassword').value;

      await registerUser(name, email, password);
      authMessage.textContent = '';
      await renderDashboard();
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      authMessage.textContent = 'Logging in...';
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      await loginUser(email, password);
      authMessage.textContent = '';
      await renderDashboard();
    } catch (error) {
      authMessage.textContent = error.message;
    }
  });

  loadGoogleButton(authMessage);
}

function loadGoogleButton(authMessage, attempts = 0) {
  if (window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          authMessage.textContent = 'Signing in with Google...';
          await googleLogin(response.credential);
          authMessage.textContent = '';
          await renderDashboard();
        } catch (error) {
          authMessage.textContent = error.message;
        }
      }
    });

    window.google.accounts.id.renderButton(
      document.getElementById('googleSignInBtn'),
      {
        theme: 'outline',
        size: 'large',
        width: 260
      }
    );

    return;
  }

  if (attempts < 20) {
    setTimeout(() => loadGoogleButton(authMessage, attempts + 1), 250);
  } else {
    authMessage.textContent = 'Google Sign-In failed to load.';
    console.error('Google script did not load.');
  }
}

console.log('GOOGLE_CLIENT_ID =', GOOGLE_CLIENT_ID);