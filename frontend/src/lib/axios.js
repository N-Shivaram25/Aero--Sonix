import axios from "axios";

// Prefer explicit backend URL set via Vite env: `VITE_BACKEND_URL` (e.g. https://api.example.com)
// In development fall back to localhost; in production fall back to relative `/api`.
const envBackend = import.meta.env.VITE_BACKEND_URL;
const BASE_URL =
  envBackend || (import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api");

export const axiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send cookies with the request
});

axiosInstance.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("aerosonix_token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      try {
        localStorage.removeItem("aerosonix_token");
      } catch {
        // ignore
      }

      const path = window.location?.pathname || "";
      if (!path.startsWith("/login") && !path.startsWith("/signup") && !path.startsWith("/admin")) {
        try {
          window.location.assign("/login");
        } catch {
          // ignore
        }
      }
    }
    return Promise.reject(error);
  }
);
