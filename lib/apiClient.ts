// lib/apiClient.ts
import axios, { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from "axios";

const TOKEN_KEY = "bd_token";

// Helper: safely get token (browser only)
const getToken = (): string | null => {
  if (typeof window === "undefined") return null;

  // primary
  const t1 = localStorage.getItem(TOKEN_KEY);
  if (t1) return t1;

  // fallbacks (in case older login saved different key)
  const t2 = localStorage.getItem("token");
  if (t2) return t2;

  const t3 = localStorage.getItem("accessToken");
  if (t3) return t3;

  return null;
};

// Create axios instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001",
  withCredentials: false, // ✅ JWT Bearer token, not cookies
  timeout: 30000,
  headers: {
    Accept: "application/json",
  },
});

// Automatically attach Authorization header (Bearer <token>)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken();

    // ✅ Axios v1 headers may be AxiosHeaders - normalize safely
    const headers =
      config.headers instanceof AxiosHeaders
        ? config.headers
        : new AxiosHeaders(config.headers);

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else {
      // If no token, ensure we don't accidentally send stale auth
      headers.delete("Authorization");
    }

    /**
     * ✅ IMPORTANT:
     * If request body is FormData, do NOT set Content-Type manually.
     * Browser will set correct boundary automatically.
     */
    const isFormData =
      typeof FormData !== "undefined" && config.data instanceof FormData;

    if (isFormData) {
      headers.delete("Content-Type");
    } else {
      // Default to JSON only when caller hasn't specified
      if (!headers.get("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
    }

    config.headers = headers;

    // Optional debugging (keep off in production)
    // if (typeof window !== "undefined") {
    //   console.log("[api] ->", config.method?.toUpperCase(), config.url, {
    //     hasToken: !!token,
    //   });
    // }

    return config;
  },
  (error) => Promise.reject(error)
);

// Global response interceptor (optional behavior)
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    // Optional auto-clear token on 401
    // if (error.response?.status === 401 && typeof window !== "undefined") {
    //   localStorage.removeItem(TOKEN_KEY);
    //   localStorage.removeItem("token");
    //   localStorage.removeItem("accessToken");
    // }

    return Promise.reject(error);
  }
);

export default api;
