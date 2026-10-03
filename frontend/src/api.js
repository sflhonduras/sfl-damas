import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('sfl_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && !err.config.url.includes('/auth/login')) {
      localStorage.removeItem('sfl_token');
      localStorage.removeItem('sfl_user');
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin') {
        window.location.href = '/admin';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export function mensajeError(err, fallback = 'Ocurrió un error inesperado. Intenta de nuevo.') {
  return err?.response?.data?.error || fallback;
}
