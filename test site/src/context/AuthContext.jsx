import { createContext, useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'synthetic_demo_session'

const SYNTHETIC_MEMBER_DATA = {
  UAN: '123456',
  name: 'Rajesh Kumar',
  balance: 450000,
  contribution: 125000,
}

export const DEMO_CREDENTIALS = {
  uan: SYNTHETIC_MEMBER_DATA.UAN,
  password: 'demo@123',
}

const VALID_UAN = DEMO_CREDENTIALS.uan
const VALID_PASSWORD = DEMO_CREDENTIALS.password

export const AuthContext = createContext(null)

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)

  const login = useCallback((uan, password) => {
    if (uan === VALID_UAN && password === VALID_PASSWORD) {
      const nextSession = {
        ...SYNTHETIC_MEMBER_DATA,
        loggedInAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
      setSession(nextSession)
      return { success: true }
    }
    return { success: false, error: 'Invalid UAN or password. Please try again.' }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
  }, [])

  const member = session
    ? {
        UAN: session.UAN,
        name: session.name,
        balance: session.balance,
        contribution: session.contribution,
      }
    : null

  const value = useMemo(
    () => ({
      isLoggedIn: Boolean(session),
      member,
      login,
      logout,
    }),
    [session, member, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
