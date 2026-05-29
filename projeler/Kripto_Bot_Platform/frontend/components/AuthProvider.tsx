"use client"
import React, { createContext, useContext, useState, useEffect } from "react"
import { GoogleOAuthProvider } from "@react-oauth/google"
import { useRouter, usePathname } from "next/navigation"

interface User {
  id: number
  email: string
  role: string
  fee_type: string
  fee_amount: number
  fee_active: boolean
  allowed_pages: string[]
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  isLoading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""

  useEffect(() => {
    // Check localStorage on mount
    const storedToken = localStorage.getItem("auth_token")
    if (storedToken) {
      // Validate token with backend
      fetch(`/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      })
        .then((res) => {
          if (res.ok) return res.json()
          throw new Error("Invalid token")
        })
        .then((userData) => {
          setToken(storedToken)
          setUser(userData)
        })
        .catch(() => {
          localStorage.removeItem("auth_token")
          if (pathname !== "/login") {
            router.push("/login")
          }
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
      if (pathname !== "/login") {
        router.push("/login")
      }
    }
  }, [pathname, router])

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("auth_token", newToken)
    setToken(newToken)
    setUser(newUser)
    router.push("/dashboard")
  }

  const logout = () => {
    localStorage.removeItem("auth_token")
    setToken(null)
    setUser(null)
    router.push("/login")
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        {children}
      </GoogleOAuthProvider>
    </AuthContext.Provider>
  )
}
