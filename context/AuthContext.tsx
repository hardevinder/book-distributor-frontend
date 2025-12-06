"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import api from "@/lib/apiClient";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* ============================
     Load token & fetch /me safely
     ============================ */
  useEffect(() => {
    const init = async () => {
      let storedToken: string | null = null;

      if (typeof window !== "undefined") {
        storedToken = localStorage.getItem("bd_token");
      }

      // ❌ No token → logged-out state
      if (!storedToken) {
        setLoading(false);
        return;
      }

      setToken(storedToken);

      try {
        // Call backend ONLY when token exists
        const res = await api.get<User>("/api/auth/me");
        setUser(res.data);
      } catch (err: any) {
        console.error("Failed to fetch user:", err);

        // If token invalid/expired → remove it
        if (err?.response?.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("bd_token");
          }
          setUser(null);
          setToken(null);
        }
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  /* ============================
     LOGIN
     ============================ */
  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>(
      "/api/auth/login",
      { email, password }
    );

    const t = res.data.token;

    setToken(t);
    setUser(res.data.user);

    if (typeof window !== "undefined") {
      localStorage.setItem("bd_token", t);
    }
  };

  /* ============================
     LOGOUT
     ============================ */
  const logout = () => {
    setUser(null);
    setToken(null);

    if (typeof window !== "undefined") {
      localStorage.removeItem("bd_token");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/* ============================
   useAuth Hook
   ============================ */
export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
