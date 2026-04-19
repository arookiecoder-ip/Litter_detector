// frontend/src/services/api.js
// Optional: If migrating to a React build-based frontend, use this API service module.

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

/**
 * Retrieve tokens from session storage.
 */
const getToken = () => sessionStorage.getItem('access');
const getRefreshToken = () => sessionStorage.getItem('refresh');

/**
 * Generic API request with automatic JWT refresh on 401.
 */
export async function apiRequest(method, path, body = null, isFormData = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData && body) headers['Content-Type'] = 'application/json';

  let res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    const refresh = getRefreshToken();
    if (refresh) {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        sessionStorage.setItem('access', data.accessToken);
        sessionStorage.setItem('refresh', data.refreshToken);
        headers['Authorization'] = `Bearer ${data.accessToken}`;
        res = await fetch(`${API_BASE}${path}`, {
          method, headers,
          body: isFormData ? body : body ? JSON.stringify(body) : undefined,
        });
      }
    }
  }

  return res;
}

/**
 * Upload a captured image with detection metadata.
 * @param {Object} params - { imageBlob, detection, latitude, longitude }
 */
export async function captureImage({ imageBlob, detection, latitude, longitude }) {
  const form = new FormData();
  form.append('image', imageBlob, 'capture.jpg');
  form.append('detection', JSON.stringify(detection));
  if (latitude != null)  form.append('latitude', String(latitude));
  if (longitude != null) form.append('longitude', String(longitude));

  const res = await apiRequest('POST', '/capture', form, true);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Capture upload failed');
  }
  return res.json();
}

export async function getCaptures({ skip = 0, limit = 20, status } = {}) {
  const qs = new URLSearchParams({ skip, limit });
  if (status) qs.append('status', status);
  const res = await apiRequest('GET', `/capture?${qs}`);
  if (!res.ok) throw new Error('Failed to fetch captures');
  return res.json();
}

export async function getCapture(id) {
  const res = await apiRequest('GET', `/capture/${id}`);
  if (!res.ok) throw new Error('Capture not found');
  return res.json();
}

export async function updateCaptureStatus(id, status) {
  const res = await apiRequest('PUT', `/capture/${id}`, { status });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export async function deleteCapture(id) {
  const res = await apiRequest('DELETE', `/capture/${id}`);
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function register({ name, email, password, gdprConsent = true }) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, gdprConsent }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export const imageUrl = (imageId) => `${API_BASE}/images/${imageId}`;
