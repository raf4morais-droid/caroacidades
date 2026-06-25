import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import { LoginScreen } from '../screens/LoginScreen'
import { ListaArvoresScreen } from '../screens/ListaArvoresScreen'
import { ColetaScreen } from '../screens/ColetaScreen'
import type { ColetaArvore } from '../lib/coletas'

export type RootStackParamList = {
  Login: undefined
  Lista: undefined
  Coleta: { coleta?: ColetaArvore } | undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1f4d2c" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator>
          <Stack.Screen name="Lista" component={ListaArvoresScreen} options={{ title: 'Coletas — Arborização' }} />
          <Stack.Screen name="Coleta" component={ColetaScreen} options={{ title: 'Registro de árvore' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}
