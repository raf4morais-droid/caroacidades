import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, Alert,
} from 'react-native'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { salvarColeta, novoLocalId, type ColetaArvore } from '../lib/coletas'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'Coleta'>

type Logradouro = { id: string; nome: string; tipo: string }

const ESTADOS_FITOSSANITARIOS = ['Bom', 'Regular', 'Ruim', 'Comprometido'] as const
const SITUACOES_CALCADA = ['Adequada', 'Danificada', 'Inexistente', 'Raízes expostas'] as const

// Registro de árvore em campo: localização (req 187), espécie/medidas, fotos (req 159/160-equivalente),
// situação fitossanitária e da calçada — funciona offline, ficando pendente de sincronização (req 188)
export function ColetaScreen({ route, navigation }: Props) {
  const existente = route.params?.coleta

  const [localId] = useState(existente?.localId ?? novoLocalId())
  const [latitude, setLatitude] = useState<number | null>(existente?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(existente?.longitude ?? null)
  const [obtendoLocal, setObtendoLocal] = useState(false)
  const [especie, setEspecie] = useState(existente?.especie ?? '')
  const [nomePopular, setNomePopular] = useState(existente?.nomePopular ?? '')
  const [alturaM, setAlturaM] = useState(existente?.alturaM?.toString() ?? '')
  const [dapCm, setDapCm] = useState(existente?.dapCm?.toString() ?? '')
  const [estadoFitossanitario, setEstadoFitossanitario] = useState(existente?.estadoFitossanitario ?? '')
  const [situacaoCalcada, setSituacaoCalcada] = useState(existente?.situacaoCalcada ?? '')
  const [buscaLogradouro, setBuscaLogradouro] = useState(existente?.logradouroNome ?? '')
  const [logradouroId, setLogradouroId] = useState(existente?.logradouroId)
  const [fotos, setFotos] = useState<string[]>(existente?.fotos ?? [])
  const [salvando, setSalvando] = useState(false)

  const { data: logradouros = [] } = useQuery<Logradouro[]>({
    queryKey: ['logradouros', buscaLogradouro],
    queryFn: () => api.get(`/logradouros?q=${encodeURIComponent(buscaLogradouro)}`).then((r) => r.data),
    enabled: buscaLogradouro.trim().length >= 3 && buscaLogradouro !== existente?.logradouroNome,
  })

  useEffect(() => {
    if (!existente) obterLocalizacao()
  }, [])

  async function obterLocalizacao() {
    setObtendoLocal(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Conceda acesso à localização para registrar o ponto de coleta.')
        return
      }
      const posicao = await Location.getCurrentPositionAsync({})
      setLatitude(posicao.coords.latitude)
      setLongitude(posicao.coords.longitude)
    } catch {
      Alert.alert('Erro', 'Não foi possível obter sua localização.')
    } finally {
      setObtendoLocal(false)
    }
  }

  async function adicionarFoto(origem: 'galeria' | 'camera') {
    const permissao = origem === 'galeria'
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync()
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Conceda acesso para anexar fotos ao registro.')
      return
    }
    const resultado = origem === 'galeria'
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 })
    if (!resultado.canceled && resultado.assets[0]) {
      setFotos((atual) => [...atual, resultado.assets[0].uri])
    }
  }

  function selecionarLogradouro(l: Logradouro) {
    setLogradouroId(l.id)
    setBuscaLogradouro(`${l.tipo} ${l.nome}`)
  }

  async function salvar() {
    if (latitude === null || longitude === null) {
      Alert.alert('Localização pendente', 'Obtenha a coordenada de coleta antes de salvar.')
      return
    }
    setSalvando(true)
    try {
      const coleta: ColetaArvore = {
        localId,
        remoteId: existente?.remoteId,
        codigo: existente?.codigo,
        latitude, longitude,
        especie: especie.trim() || undefined,
        nomePopular: nomePopular.trim() || undefined,
        alturaM: alturaM.trim() ? Number(alturaM.replace(',', '.')) : undefined,
        dapCm: dapCm.trim() ? Number(dapCm.replace(',', '.')) : undefined,
        estadoFitossanitario: estadoFitossanitario || undefined,
        situacaoCalcada: situacaoCalcada || undefined,
        logradouroId,
        logradouroNome: buscaLogradouro.trim() || undefined,
        fotos,
        sincronizado: false,
        criadoEm: existente?.criadoEm ?? new Date().toISOString(),
      }
      await salvarColeta(coleta)
      navigation.goBack()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Localização da coleta</Text>
      <View style={styles.linhaLocal}>
        <Text style={styles.coordenadas}>
          {latitude !== null && longitude !== null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : 'Localização não obtida'}
        </Text>
        <TouchableOpacity style={styles.botaoBuscar} onPress={obterLocalizacao} disabled={obtendoLocal}>
          {obtendoLocal ? <ActivityIndicator color="#1f4d2c" /> : <Text style={styles.botaoBuscarTexto}>📍 Atualizar</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Espécie</Text>
      <TextInput style={styles.input} value={especie} onChangeText={setEspecie} placeholder="Ex.: Lafoensia pacari" />

      <Text style={styles.label}>Nome popular</Text>
      <TextInput style={styles.input} value={nomePopular} onChangeText={setNomePopular} placeholder="Ex.: Dedaleiro" />

      <View style={styles.linhaDupla}>
        <View style={styles.flex1}>
          <Text style={styles.label}>Altura (m)</Text>
          <TextInput style={styles.input} value={alturaM} onChangeText={setAlturaM} placeholder="0,0" keyboardType="decimal-pad" />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>DAP (cm)</Text>
          <TextInput style={styles.input} value={dapCm} onChangeText={setDapCm} placeholder="0,0" keyboardType="decimal-pad" />
        </View>
      </View>

      <Text style={styles.label}>Estado fitossanitário</Text>
      <View style={styles.opcoes}>
        {ESTADOS_FITOSSANITARIOS.map((opcao) => (
          <TouchableOpacity
            key={opcao}
            style={[styles.chip, estadoFitossanitario === opcao && styles.chipAtivo]}
            onPress={() => setEstadoFitossanitario(opcao)}
          >
            <Text style={[styles.chipTexto, estadoFitossanitario === opcao && styles.chipTextoAtivo]}>{opcao}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Situação da calçada</Text>
      <View style={styles.opcoes}>
        {SITUACOES_CALCADA.map((opcao) => (
          <TouchableOpacity
            key={opcao}
            style={[styles.chip, situacaoCalcada === opcao && styles.chipAtivo]}
            onPress={() => setSituacaoCalcada(opcao)}
          >
            <Text style={[styles.chipTexto, situacaoCalcada === opcao && styles.chipTextoAtivo]}>{opcao}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Logradouro</Text>
      <TextInput
        style={styles.input}
        value={buscaLogradouro}
        onChangeText={(texto) => { setBuscaLogradouro(texto); setLogradouroId(undefined) }}
        placeholder="Digite para buscar (mín. 3 letras)"
      />
      {logradouros.length > 0 && !logradouroId && (
        <View style={styles.listaSugestoes}>
          {logradouros.slice(0, 5).map((l) => (
            <TouchableOpacity key={l.id} style={styles.sugestao} onPress={() => selecionarLogradouro(l)}>
              <Text style={styles.sugestaoTexto}>{l.tipo} {l.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={styles.label}>Fotos (árvore e calçada)</Text>
      <View style={styles.opcoes}>
        {fotos.map((uri) => (
          <View key={uri} style={styles.fotoWrapper}>
            <Image source={{ uri }} style={styles.foto} />
            <TouchableOpacity style={styles.removerFoto} onPress={() => setFotos((a) => a.filter((f) => f !== uri))}>
              <Text style={styles.removerFotoTexto}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={styles.opcoes}>
        <TouchableOpacity style={styles.botaoSecundario} onPress={() => adicionarFoto('galeria')}>
          <Text style={styles.botaoSecundarioTexto}>🖼 Galeria</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoSecundario} onPress={() => adicionarFoto('camera')}>
          <Text style={styles.botaoSecundarioTexto}>📷 Câmera</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botaoSalvar} onPress={salvar} disabled={salvando}>
        {salvando ? <ActivityIndicator color="white" /> : <Text style={styles.botaoSalvarTexto}>Salvar registro</Text>}
      </TouchableOpacity>
      <Text style={styles.aviso}>O registro fica salvo no aparelho e é enviado ao SIG WEB na sincronização.</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: '#1f4d2c', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  linhaLocal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  coordenadas: { fontSize: 14, color: '#374151', flexShrink: 1 },
  botaoBuscar: { borderWidth: 1, borderColor: '#1f4d2c', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  botaoBuscarTexto: { color: '#1f4d2c', fontWeight: '600', fontSize: 13 },
  linhaDupla: { flexDirection: 'row', gap: 12 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipAtivo: { backgroundColor: '#1f4d2c', borderColor: '#1f4d2c' },
  chipTexto: { fontSize: 13, color: '#374151' },
  chipTextoAtivo: { color: 'white', fontWeight: '600' },
  listaSugestoes: { backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 4, overflow: 'hidden' },
  sugestao: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sugestaoTexto: { fontSize: 14, color: '#374151' },
  fotoWrapper: { position: 'relative' },
  foto: { width: 84, height: 84, borderRadius: 10 },
  removerFoto: {
    position: 'absolute', top: -6, right: -6, backgroundColor: '#dc2626', borderRadius: 10,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  removerFotoTexto: { color: 'white', fontSize: 12, fontWeight: '700' },
  botaoSecundario: { borderWidth: 1, borderColor: '#1f4d2c', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  botaoSecundarioTexto: { color: '#1f4d2c', fontWeight: '600', fontSize: 13 },
  botaoSalvar: { backgroundColor: '#1f4d2c', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  botaoSalvarTexto: { color: 'white', fontSize: 16, fontWeight: '700' },
  aviso: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 10 },
})
