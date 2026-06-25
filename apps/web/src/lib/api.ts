import axios from 'axios'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? '') + '/api',
  timeout: 30_000,
})

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      signOut(auth).finally(() => { window.location.href = '/login' })
    }
    return Promise.reject(err)
  }
)

export default api
