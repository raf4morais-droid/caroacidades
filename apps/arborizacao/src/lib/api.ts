import axios from 'axios'
import Constants from 'expo-constants'
import { auth } from './firebase'

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000'

const api = axios.create({
  baseURL: `${API_URL}/api`,
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

export default api
