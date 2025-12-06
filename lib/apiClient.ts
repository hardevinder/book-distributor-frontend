// lib/apiClient.ts
import axios from "axios";

// Create axios instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001",
  withCredentials: false, // we are using JWT Bearer token, not cookies
});

// Automatically attach Authorization header (Bearer <token>)
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("bd_token"); // 🔥 correct token key

      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Optional: Global response interceptor (clean way)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // AxiosError format
    // If needed, we can add centralized 401 handling here later
    return Promise.reject(error);
  }
);

export default api;
