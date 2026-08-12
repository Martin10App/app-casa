import { getAuthToken } from '../firebase.js';

/** Calls a private household API using the current Firebase session. */
export async function apiFetch(url, options = {}) {
  const token = await getAuthToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

