import { initializeApp, getApps, getApp } from 'firebase/app'
import { initializeAuth, getAuth } from 'firebase/auth'
import { getReactNativePersistence } from '@firebase/auth'
import { getStorage } from 'firebase/storage'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Mesmo projeto Firebase usado em apps/web/src/lib/firebase.ts (caroacidades)
const firebaseConfig = {
  apiKey:            'AIzaSyBwOZa2zHL3xGUJdHCadY7yGcd_j7PxZRQ',
  authDomain:        'caroacidades.firebaseapp.com',
  projectId:         'caroacidades',
  storageBucket:     'caroacidades.firebasestorage.app',
  messagingSenderId: '157770574922',
  appId:             '1:157770574922:web:bcd1a9e0b9a60ae5118ab3',
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const storage = getStorage(app)

// initializeAuth só pode ser chamado uma vez — em fast refresh, reaproveita a instância existente
export const auth = (() => {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  } catch {
    return getAuth(app)
  }
})()
