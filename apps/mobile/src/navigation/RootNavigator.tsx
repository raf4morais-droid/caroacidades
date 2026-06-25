import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import { LoginScreen } from '../screens/LoginScreen'
import { MapScreen } from '../screens/MapScreen'
import { NovaSolicitacaoScreen } from '../screens/NovaSolicitacaoScreen'
import { MinhasSolicitacoesScreen } from '../screens/MinhasSolicitacoesScreen'
import { PerfilScreen } from '../screens/PerfilScreen'

export type RootStackParamList = {
  Login: undefined
  Mapa: undefined
  NovaSolicitacao: { latitude: number; longitude: number } | undefined
  MinhasSolicitacoes: undefined
  Perfil: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1e3a5f" />
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
          <Stack.Screen name="Mapa" component={MapScreen} options={{ title: 'SIGWEB Tupanciretã' }} />
          <Stack.Screen name="NovaSolicitacao" component={NovaSolicitacaoScreen} options={{ title: 'Nova solicitação' }} />
          <Stack.Screen name="MinhasSolicitacoes" component={MinhasSolicitacoesScreen} options={{ title: 'Minhas solicitações' }} />
          <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Meu perfil' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}
