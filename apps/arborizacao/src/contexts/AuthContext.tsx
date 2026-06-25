import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../lib/firebase'

type AuthContextValue = {
  user: User | null
  perfil: string | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, perfil: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (current) {
        try {
          const tokenResult = await current.getIdTokenResult()
          setPerfil((tokenResult.claims.perfil as string | undefined) ?? null)
        } catch {
          setPerfil(null)
        }
        setUser(current)
      } else {
        setUser(null)
        setPerfil(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, perfil, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// O app é restrito a fiscais de campo — credenciais configuradas pelo sistema (req 169)
export function isFiscalCampo(perfil: string | null) {
  return perfil === 'ADMIN' || perfil === 'FISCAL_CAMPO'
}
