import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Lowercase: axios normalises response header names.
const RENEWED_TOKEN_HEADER = 'x-renewed-token';

/**
 * Slide the session forward.
 *
 * The backend returns a replacement token on any authenticated request that is
 * nearing its expiry (see backend/config/session.js), so a dashboard that is
 * actually being used never hits the expiry at all. Requires the header to be
 * listed in the server's CORS `exposedHeaders` — cross-origin JS cannot read a
 * custom response header otherwise, and the renewal would silently never land.
 */
const storeRenewedToken = (response) => {
  const renewed = response?.headers?.[RENEWED_TOKEN_HEADER];
  if (renewed) localStorage.setItem('token', renewed);
};

axiosInstance.interceptors.response.use(
  (response) => {
    storeRenewedToken(response);
    return response;
  },
  (error) => {
    // A renewal can ride along on an error response too (a 404 from an
    // authenticated request is still proof the session is alive).
    if (error.response) storeRenewedToken(error.response);

    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;