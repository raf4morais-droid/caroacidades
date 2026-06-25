import type { Persistence } from 'firebase/auth'

// @firebase/auth exports getReactNativePersistence under the "react-native" condition,
// but TypeScript resolves the "types" key first in the exports map, missing it.
// Metro resolves correctly at runtime; this declaration bridges the gap.
declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
    removeItem(key: string): Promise<void>
  }): Persistence
}
