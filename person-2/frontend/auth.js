const API_BASE = 'http://localhost:5000/api';

export async function registerUser(name, email, password) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Registration failed.');
  }

  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));

  return data.user;
}

export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Login failed.');
  }

  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));

  return data.user;
}

export function logoutUser() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getToken() {
  return localStorage.getItem('token');
}

export function getStoredUser() {
  const rawUser = localStorage.getItem('user');
  return rawUser ? JSON.parse(rawUser) : null;
}

export async function getCurrentUser() {
  const token = getToken();

  if (!token) return null;

  const response = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    logoutUser();
    return null;
  }

  const data = await response.json();
  localStorage.setItem('user', JSON.stringify(data.user));
  return data.user;
}

export async function isLoggedIn() {
  const user = await getCurrentUser();
  return !!user;
}

export const GOOGLE_CLIENT_ID =
  '803141223151-35r37bqp2ov98b8m46rlq6j7332282q6.apps.googleusercontent.com';

export async function googleLogin(credential) {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credential }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Google login failed.');
  }

  localStorage.setItem('token', data.token);
  localStorage.setItem('user', JSON.stringify(data.user));

  return data.user;
}