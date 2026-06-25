import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import { LoginScreen } from '../screens/LoginScreen'
import { LoteamentosScreen } from '../screens/LoteamentosScreen'
import { LotesScreen } from '../screens/LotesScreen'
import { BicScreen } from '../screens/BicScreen'
import { MeusBicsScreen } from '../screens/MeusBicsScreen'
import type { BicColetado } from '../lib/bics'

export type RootStackParamList = {
  Login: undefined
  Loteamentos: undefined
  Lotes: { loteamentoId: string; loteamentoNome: string }
  Bic: {
    bic?: BicColetado
    parcelaId?: string
    parcelaCodigo?: string
    loteamentoNome?: string
  } | undefined
  MeusBics: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#7c3f1d" />
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
          <Stack.Screen name="Loteamentos" component={LoteamentosScreen} options={{ title: 'Loteamentos' }} />
          <Stack.Screen name="Lotes" component={LotesScreen} options={({ route }) => ({ title: route.params.loteamentoNome })} />
          <Stack.Screen name="Bic" component={BicScreen} options={{ title: 'Boletim de Informação Cadastral' }} />
          <Stack.Screen name="MeusBics" component={MeusBicsScreen} options={{ title: 'Meus BICs' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}
