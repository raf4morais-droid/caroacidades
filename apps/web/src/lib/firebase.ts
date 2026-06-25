import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
  apiKey:            'AIzaSyBwOZa2zHL3xGUJdHCadY7yGcd_j7PxZRQ',
  authDomain:        'caroacidades.firebaseapp.com',
  projectId:         'caroacidades',
  storageBucket:     'caroacidades.firebasestorage.app',
  messagingSenderId: '157770574922',
  appId:             '1:157770574922:web:bcd1a9e0b9a60ae5118ab3',
  measurementId:     'G-7NZSXT6JVF',
}

const app = initializeApp(firebaseConfig)
export const auth    = getAuth(app)
export const storage = getStorage(app)

// Analytics só é suportado em navegadores (não SSR/Node)
isSupported().then((ok: boolean) => { if (ok) getAnalytics(app) })
