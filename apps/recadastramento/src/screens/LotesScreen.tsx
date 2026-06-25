import { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, ScrollView } from 'react-native'
import MapView, { Polygon, WMSTile, type Region } from 'react-native-maps'
import { useNetInfo } from '@react-native-community/netinfo'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import { lerCacheLotes, salvarCacheLotes, type Lote } from '../lib/cache'
import { geometryParaPoligonos, centroide, CORES_SITUACAO } from '../lib/geo'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'Lotes'>

type CamadaWms = {
  id: string
  nome: string
  url: string
  camada_wms: string
  formato: string
  transparente: boolean
  opacidade: number
  ativa: boolean
}

function urlTemplateWms(c: CamadaWms) {
  const separador = c.url.includes('?') ? '&' : '?'
  return `${c.url}${separador}service=WMS&version=1.1.0&request=GetMap&layers=${encodeURIComponent(c.camada_wms)}`
    + `&styles=&bbox={minX},{minY},{maxX},{maxY}&width={width}&height={height}`
    + `&srs=EPSG:900913&format=${encodeURIComponent(c.formato)}&transparent=${c.transparente}`
}

const LEGENDA = [
  { situacao: 'pendente', rotulo: 'Pendente' },
  { situacao: 'visitado', rotulo: 'Visitado' },
  { situacao: 'recadastrado', rotulo: 'Recadastrado' },
  { situacao: 'impedido', rotulo: 'Impedido' },
] as const

// Seleção do lote para coleta — pelo mapa (req 171, com camada temática de
// situação do recadastramento — req 174) ou por lista (req 172). Lotes
// cacheados localmente para uso offline (req 175)
export function LotesScreen({ route, navigation }: Props) {
  const { loteamentoId, loteamentoNome } = route.params
  const netInfo = useNetInfo()
  const [modoMapa, setModoMapa] = useState(true)
  const [lotes, setLotes] = useState<Lote[]>([])
  const [carregando, setCarregando] = useState(true)
  const [regiao, setRegiao] = useState<Region | null>(null)
  const [camadasAtivas, setCamadasAtivas] = useState<string[]>([])
  const [menuCamadas, setMenuCamadas] = useState(false)

  const { data, isFetching } = useQuery<Lote[]>({
    queryKey: ['lotes', loteamentoId],
    queryFn: () => api.get(`/mobile/loteamentos/${loteamentoId}/lotes`).then((r) => r.data),
    enabled: !!netInfo.isConnected,
  })

  // Camadas configuradas no SIG WEB, habilitáveis sobre o mapa de seleção — req 173
  const { data: camadasWms = [] } = useQuery<CamadaWms[]>({
    queryKey: ['camadas-wms'],
    queryFn: () => api.get('/camadas-wms').then((r) => r.data),
    enabled: !!netInfo.isConnected,
  })
  const wmsAtivas = camadasWms.filter((c) => c.ativa)

  function alternarCamada(id: string) {
    setCamadasAtivas((atual) => atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id])
  }

  useEffect(() => {
    if (data) {
      setLotes(data)
      setCarregando(false)
      salvarCacheLotes(loteamentoId, data)
    }
  }, [data])

  useEffect(() => {
    if (!netInfo.isConnected) {
      lerCacheLotes(loteamentoId).then((cache) => { setLotes(cache); setCarregando(false) })
    }
  }, [netInfo.isConnected, loteamentoId])

  useEffect(() => {
    if (lotes.length === 0 || regiao) return
    const todosOsPontos = lotes.flatMap((l) => geometryParaPoligonos(l.geometry).flatMap((p) => p.contorno))
    if (!todosOsPontos.length) return
    const centro = centroide(todosOsPontos)
    setRegiao({ ...centro, latitudeDelta: 0.01, longitudeDelta: 0.01 })
  }, [lotes])

  function selecionar(lote: Lote) {
    navigation.navigate('Bic', {
      parcelaId: lote.id,
      parcelaCodigo: lote.codigo,
      loteamentoNome,
    })
  }

  if (carregando || (isFetching && lotes.length === 0)) {
    return <ActivityIndicator style={styles.flex} size="large" color="#7c3f1d" />
  }

  return (
    <View style={styles.flex}>
      <View style={styles.alternador}>
        <TouchableOpacity style={[styles.aba, modoMapa && styles.abaAtiva]} onPress={() => setModoMapa(true)}>
          <Text style={[styles.abaTexto, modoMapa && styles.abaTextoAtivo]}>🗺️ Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.aba, !modoMapa && styles.abaAtiva]} onPress={() => setModoMapa(false)}>
          <Text style={[styles.abaTexto, !modoMapa && styles.abaTextoAtivo]}>📋 Lista</Text>
        </TouchableOpacity>
      </View>

      {modoMapa ? (
        <View style={styles.flex}>
          {regiao && (
            <MapView style={styles.flex} initialRegion={regiao} showsUserLocation>
              {wmsAtivas.filter((c) => camadasAtivas.includes(c.id)).map((c) => (
                <WMSTile key={c.id} urlTemplate={urlTemplateWms(c)} opacity={c.opacidade} zIndex={1} />
              ))}
              {lotes.flatMap((lote) =>
                geometryParaPoligonos(lote.geometry).map((poligono, i) => (
                  <Polygon
                    key={`${lote.id}_${i}`}
                    coordinates={poligono.contorno}
                    holes={poligono.buracos}
                    strokeColor={CORES_SITUACAO[lote.situacao_recadastramento]}
                    fillColor={`${CORES_SITUACAO[lote.situacao_recadastramento]}55`}
                    strokeWidth={2}
                    tappable
                    onPress={() => selecionar(lote)}
                  />
                ))
              )}
            </MapView>
          )}
          <View style={styles.legenda}>
            {LEGENDA.map((l) => (
              <View key={l.situacao} style={styles.legendaItem}>
                <View style={[styles.legendaCor, { backgroundColor: CORES_SITUACAO[l.situacao] }]} />
                <Text style={styles.legendaTexto}>{l.rotulo}</Text>
              </View>
            ))}
          </View>
          {wmsAtivas.length > 0 && (
            <TouchableOpacity style={styles.botaoCamadas} onPress={() => setMenuCamadas(true)}>
              <Text style={styles.botaoCamadasTexto}>🗂️ Camadas</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.dica}>Toque em um lote no mapa para iniciar a coleta do BIC</Text>

          <Modal visible={menuCamadas} transparent animationType="fade" onRequestClose={() => setMenuCamadas(false)}>
            <TouchableOpacity style={styles.modalFundo} activeOpacity={1} onPress={() => setMenuCamadas(false)}>
              <View style={styles.modalConteudo}>
                <Text style={styles.modalTitulo}>Camadas do SIG WEB</Text>
                <ScrollView>
                  {wmsAtivas.map((c) => {
                    const ativo = camadasAtivas.includes(c.id)
                    return (
                      <TouchableOpacity key={c.id} style={[styles.opcaoCamada, ativo && styles.opcaoCamadaAtiva]} onPress={() => alternarCamada(c.id)}>
                        <Text style={[styles.opcaoCamadaTexto, ativo && styles.opcaoCamadaTextoAtivo]}>{ativo ? '☑' : '☐'} {c.nome}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      ) : (
        <FlatList
          data={lotes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.lista}
          ListEmptyComponent={<Text style={styles.vazio}>Nenhum lote encontrado neste loteamento.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => selecionar(item)}>
              <View style={styles.itemTextos}>
                <Text style={styles.itemTitulo}>Lote {item.codigo}</Text>
                {item.area_m2 != null && <Text style={styles.itemSubtitulo}>{item.area_m2.toFixed(1)} m²</Text>}
              </View>
              <View style={[styles.badge, { backgroundColor: `${CORES_SITUACAO[item.situacao_recadastramento]}33` }]}>
                <Text style={[styles.badgeTexto, { color: CORES_SITUACAO[item.situacao_recadastramento] }]}>
                  {item.situacao_recadastramento}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  alternador: { flexDirection: 'row', padding: 12, gap: 8 },
  aba: { flex: 1, borderWidth: 1, borderColor: '#7c3f1d', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  abaAtiva: { backgroundColor: '#7c3f1d' },
  abaTexto: { color: '#7c3f1d', fontWeight: '600', fontSize: 13 },
  abaTextoAtivo: { color: 'white' },
  legenda: {
    position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10, padding: 10, gap: 4,
  },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendaCor: { width: 12, height: 12, borderRadius: 3 },
  legendaTexto: { fontSize: 12, color: '#374151' },
  botaoCamadas: {
    position: 'absolute', top: 12, right: 12, backgroundColor: 'white', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  botaoCamadasTexto: { color: '#7c3f1d', fontWeight: '600', fontSize: 13 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modalConteudo: { backgroundColor: 'white', borderRadius: 14, padding: 16, maxHeight: 360 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#7c3f1d', marginBottom: 10 },
  opcaoCamada: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  opcaoCamadaAtiva: { backgroundColor: '#fdf3ec' },
  opcaoCamadaTexto: { fontSize: 15, color: '#374151' },
  opcaoCamadaTextoAtivo: { color: '#7c3f1d', fontWeight: '700' },
  dica: {
    position: 'absolute', bottom: 16, left: 16, right: 16, textAlign: 'center',
    backgroundColor: 'rgba(124,63,29,0.9)', color: 'white', fontSize: 12,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
  },
  lista: { padding: 16, gap: 10 },
  vazio: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'white', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemTextos: { flex: 1 },
  itemTitulo: { fontSize: 15, fontWeight: '700', color: '#7c3f1d' },
  itemSubtitulo: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10 },
  badgeTexto: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
})
