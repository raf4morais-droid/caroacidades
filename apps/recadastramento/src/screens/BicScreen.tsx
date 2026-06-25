import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, Alert,
} from 'react-native'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { salvarBic, novoLocalId, type BicColetado, type SituacaoRecadastramento } from '../lib/bics'

type Props = NativeStackScreenProps<RootStackParamList, 'Bic'>

const SITUACOES: { valor: SituacaoRecadastramento; rotulo: string }[] = [
  { valor: 'visitado', rotulo: 'Visitado' },
  { valor: 'recadastrado', rotulo: 'Recadastrado' },
  { valor: 'impedido', rotulo: 'Impedido' },
]

const ESTADOS_CONSERVACAO = ['Novo', 'Bom', 'Regular', 'Ruim'] as const

// Boletim de Informação Cadastral: situação do recadastramento, áreas, tipologia,
// fotos/croquis/documentos (req 177) e coordenada do ponto de coleta (req 180) — funciona offline (req 181)
export function BicScreen({ route, navigation }: Props) {
  const params = route.params
  const existente = params?.bic

  const [localId] = useState(existente?.localId ?? novoLocalId())
  const parcelaId = existente?.parcelaId ?? params?.parcelaId
  const parcelaCodigo = existente?.parcelaCodigo ?? params?.parcelaCodigo
  const loteamentoNome = existente?.loteamentoNome ?? params?.loteamentoNome

  const [situacao, setSituacao] = useState<SituacaoRecadastramento>(existente?.situacaoRecadastramento ?? 'visitado')
  const [areaTerreno, setAreaTerreno] = useState(existente?.areaTerreno?.toString() ?? '')
  const [areaEdificada, setAreaEdificada] = useState(existente?.areaEdificada?.toString() ?? '')
  const [numeroPavimentos, setNumeroPavimentos] = useState(existente?.numeroPavimentos?.toString() ?? '')
  const [tipologiaConstrutiva, setTipologiaConstrutiva] = useState(existente?.tipologiaConstrutiva ?? '')
  const [estadoConservacao, setEstadoConservacao] = useState(existente?.estadoConservacao ?? '')
  const [numeroPredial, setNumeroPredial] = useState(existente?.numeroPredial ?? '')
  const [observacoes, setObservacoes] = useState(existente?.observacoes ?? '')
  const [latitude, setLatitude] = useState<number | null>(existente?.latitudeColeta ?? null)
  const [longitude, setLongitude] = useState<number | null>(existente?.longitudeColeta ?? null)
  const [obtendoLocal, setObtendoLocal] = useState(false)
  const [fotos, setFotos] = useState<string[]>(existente?.fotos ?? [])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!existente) obterLocalizacao()
  }, [])

  if (!parcelaId) {
    return (
      <View style={[styles.flex, styles.centro]}>
        <Text style={styles.vazio}>Selecione um lote para iniciar a coleta do BIC.</Text>
      </View>
    )
  }

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
      Alert.alert('Permissão necessária', 'Conceda acesso para anexar fotos, croquis ou documentos ao BIC.')
      return
    }
    const resultado = origem === 'galeria'
      ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7 })
      : await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 })
    if (!resultado.canceled && resultado.assets[0]) {
      setFotos((atual) => [...atual, resultado.assets[0].uri])
    }
  }

  async function salvar() {
    setSalvando(true)
    try {
      const bic: BicColetado = {
        localId,
        remoteId: existente?.remoteId,
        parcelaId: parcelaId!,
        parcelaCodigo,
        loteamentoNome,
        situacaoRecadastramento: situacao,
        areaTerreno: areaTerreno.trim() ? Number(areaTerreno.replace(',', '.')) : undefined,
        areaEdificada: areaEdificada.trim() ? Number(areaEdificada.replace(',', '.')) : undefined,
        numeroPavimentos: numeroPavimentos.trim() ? Number(numeroPavimentos) : undefined,
        tipologiaConstrutiva: tipologiaConstrutiva.trim() || undefined,
        estadoConservacao: estadoConservacao || undefined,
        numeroPredial: numeroPredial.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        fotos,
        latitudeColeta: latitude ?? undefined,
        longitudeColeta: longitude ?? undefined,
        sincronizado: false,
        criadoEm: existente?.criadoEm ?? new Date().toISOString(),
      }
      await salvarBic(bic)
      navigation.navigate('MeusBics')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.cabecalho}>
        Lote {parcelaCodigo}{loteamentoNome ? ` · ${loteamentoNome}` : ''}
      </Text>

      <Text style={styles.label}>Situação do recadastramento</Text>
      <View style={styles.opcoes}>
        {SITUACOES.map((s) => (
          <TouchableOpacity
            key={s.valor}
            style={[styles.chip, situacao === s.valor && styles.chipAtivo]}
            onPress={() => setSituacao(s.valor)}
          >
            <Text style={[styles.chipTexto, situacao === s.valor && styles.chipTextoAtivo]}>{s.rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Coordenada do ponto de coleta</Text>
      <View style={styles.linhaLocal}>
        <Text style={styles.coordenadas}>
          {latitude !== null && longitude !== null
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : 'Localização não obtida'}
        </Text>
        <TouchableOpacity style={styles.botaoBuscar} onPress={obterLocalizacao} disabled={obtendoLocal}>
          {obtendoLocal ? <ActivityIndicator color="#7c3f1d" /> : <Text style={styles.botaoBuscarTexto}>📍 Atualizar</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.linhaDupla}>
        <View style={styles.flex1}>
          <Text style={styles.label}>Área do terreno (m²)</Text>
          <TextInput style={styles.input} value={areaTerreno} onChangeText={setAreaTerreno} placeholder="0,0" keyboardType="decimal-pad" />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>Área edificada (m²)</Text>
          <TextInput style={styles.input} value={areaEdificada} onChangeText={setAreaEdificada} placeholder="0,0" keyboardType="decimal-pad" />
        </View>
      </View>

      <View style={styles.linhaDupla}>
        <View style={styles.flex1}>
          <Text style={styles.label}>Pavimentos</Text>
          <TextInput style={styles.input} value={numeroPavimentos} onChangeText={setNumeroPavimentos} placeholder="0" keyboardType="number-pad" />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>Número predial</Text>
          <TextInput style={styles.input} value={numeroPredial} onChangeText={setNumeroPredial} placeholder="Ex.: 123" />
        </View>
      </View>

      <Text style={styles.label}>Tipologia construtiva</Text>
      <TextInput style={styles.input} value={tipologiaConstrutiva} onChangeText={setTipologiaConstrutiva} placeholder="Ex.: Residencial unifamiliar" />

      <Text style={styles.label}>Estado de conservação</Text>
      <View style={styles.opcoes}>
        {ESTADOS_CONSERVACAO.map((opcao) => (
          <TouchableOpacity
            key={opcao}
            style={[styles.chip, estadoConservacao === opcao && styles.chipAtivo]}
            onPress={() => setEstadoConservacao(opcao)}
          >
            <Text style={[styles.chipTexto, estadoConservacao === opcao && styles.chipTextoAtivo]}>{opcao}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Observações</Text>
      <TextInput
        style={[styles.input, styles.textoMultilinha]}
        value={observacoes}
        onChangeText={setObservacoes}
        placeholder="Informações adicionais sobre o imóvel"
        multiline
      />

      <Text style={styles.label}>Fotos, croquis e documentos</Text>
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
        {salvando ? <ActivityIndicator color="white" /> : <Text style={styles.botaoSalvarTexto}>Salvar BIC</Text>}
      </TouchableOpacity>
      <Text style={styles.aviso}>O BIC fica salvo no aparelho e é enviado ao SIG WEB na sincronização.</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1 },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 16, paddingBottom: 40 },
  cabecalho: { fontSize: 16, fontWeight: '700', color: '#7c3f1d', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#7c3f1d', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  textoMultilinha: { minHeight: 80, textAlignVertical: 'top' },
  linhaLocal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  coordenadas: { fontSize: 14, color: '#374151', flexShrink: 1 },
  botaoBuscar: { borderWidth: 1, borderColor: '#7c3f1d', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  botaoBuscarTexto: { color: '#7c3f1d', fontWeight: '600', fontSize: 13 },
  linhaDupla: { flexDirection: 'row', gap: 12 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipAtivo: { backgroundColor: '#7c3f1d', borderColor: '#7c3f1d' },
  chipTexto: { fontSize: 13, color: '#374151' },
  chipTextoAtivo: { color: 'white', fontWeight: '600' },
  fotoWrapper: { position: 'relative' },
  foto: { width: 84, height: 84, borderRadius: 10 },
  removerFoto: {
    position: 'absolute', top: -6, right: -6, backgroundColor: '#dc2626', borderRadius: 10,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  removerFotoTexto: { color: 'white', fontSize: 12, fontWeight: '700' },
  botaoSecundario: { borderWidth: 1, borderColor: '#7c3f1d', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  botaoSecundarioTexto: { color: '#7c3f1d', fontWeight: '600', fontSize: 13 },
  botaoSalvar: { backgroundColor: '#7c3f1d', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  botaoSalvarTexto: { color: 'white', fontSize: 16, fontWeight: '700' },
  aviso: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 10 },
  vazio: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
})
