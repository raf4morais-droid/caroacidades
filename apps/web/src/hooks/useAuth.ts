import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../store/auth.store'
import { UserRole } from '@sigweb/shared'

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const tokenResult = await user.getIdTokenResult()
        const perfil = (tokenResult.claims.perfil as UserRole) ?? 'CIDADAO'
        setUser(user, perfil)
      } else {
        setUser(null)
      }
    })
    return unsubscribe
  }, [setUser])
}
