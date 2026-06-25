import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../store/auth.store'
import { UserRole } from '@sigweb/shared'

export function useAuthInit() {
  const { setUser } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult()
          const perfil = (tokenResult.claims.perfil as UserRole) ?? 'ADMIN'
          setUser(user, perfil)
        } catch {
          // Token fetch falhou (ex: offline); autentica com perfil padrão
          setUser(user, 'ADMIN')
        }
      } else {
        setUser(null)
      }
    })
    return unsubscribe
  }, [setUser])
}
