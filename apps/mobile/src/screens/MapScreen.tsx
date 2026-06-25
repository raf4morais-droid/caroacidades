import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native'
import MapView, { Marker, WMSTile, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { useQuery } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/RootNavigator'
import api from '../lib/api'

type Props = NativeStackScreenProps<RootStackParamList, 'Mapa'>

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

const REGIAO_INICIAL: Region = {
  latitude: -29.0889,
  longitude: -53.8383,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}

function urlTemplateWms(c: CamadaWms) {
  const separador = c.url.includes('?') ? '&' : '?'
  return `${c.url}${separador}service=WMS&version=1.1.0&request=GetMap&layers=${encodeURIComponent(c.camada_wms)}`
    + `&styles=&bbox={minX},{minY},{maxX},{maxY}&width={width}&height={height}`
    + `&srs=EPSG:900913&format=${encodeURIComponent(c.formato)}&transparent=${c.transparente}`
}

// Mapa principal: seleção de camadas configuradas no SIG WEB (req 156) e
// posicionamento do marcador para nova solicitação movendo o mapa (req 158)
export function MapScreen({ navigation }: Props) {
  const [regiao, setRegiao] = useState<Region>(REGIAO_INICIAL)
  const [satelite, setSatelite] = useState(false)
  const [camadasAtivas, setCamadasAtivas] = useState<string[]>([])
  const [menuCamadas, setMenuCamadas] = useState(false)

  const { data: camadasWms = [] } = useQuery<CamadaWms[]>({
    queryKey: ['camadas-wms'],
    queryFn: () => api.get('/camadas-wms').then((r) => r.data),
  })
  const wmsAtivas = camadasWms.filter((c) => c.ativa)

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const posicao = await Location.getCurrentPositionAsync({})
      setRegiao((atual) => ({
        ...atual,
        latitude: posicao.coords.latitude,
        longitude: posicao.coords.longitude,
      }))
    })()
  }, [])

  function alternarCamada(id: string) {
    setCamadasAtivas((atual) => atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id])
  }

  return (
    <View style={styles.flex}>
      <MapView
        style={styles.flex}
        initialRegion={REGIAO_INICIAL}
        region={regiao}
        onRegionChangeComplete={setRegiao}
        mapType={satelite ? 'satellite' : 'standard'}
        showsUserLocation
        showsMyLocationButton
      >
        {wmsAtivas.filter((c) => camadasAtivas.includes(c.id)).map((c) => (
          <WMSTile key={c.id} urlTemplate={urlTemplateWms(c)} opacity={c.opacidade} zIndex={1} />
        ))}
        <Marker coordinate={{ latitude: regiao.latitude, longitude: regiao.longitude }} pinColor="#1e3a5f" />
      </MapView>

      <View pointerEvents="box-none" style={styles.overlayTopo}>
        <TouchableOpacity style={styles.botaoFlutuante} onPress={() => setMenuCamadas(true)}>
          <Text style={styles.botaoFlutuanteTexto}>🗂️ Camadas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoFlutuante} onPress={() => navigation.navigate('MinhasSolicitacoes')}>
          <Text style={styles.botaoFlutuanteTexto}>📋 Minhas solicitações</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.botaoFlutuante} onPress={() => navigation.navigate('Perfil')}>
          <Text style={styles.botaoFlutuanteTexto}>👤 Perfil</Text>
        </TouchableOpacity>
      </View>

      <View pointerEvents="box-none" style={styles.overlayCentro}>
        <Text style={styles.dicaPosicionamento}>Mova o mapa para posicionar o marcador no local da solicitação</Text>
      </View>

      <View style={styles.rodape}>
        <TouchableOpacity
          style={styles.botaoNovaSolicitacao}
          onPress={() => navigation.navigate('NovaSolicitacao', { latitude: regiao.latitude, longitude: regiao.longitude })}
        >
          <Text style={styles.botaoNovaSolicitacaoTexto}>+ Nova solicitação neste local</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={menuCamadas} transparent animationType="fade" onRequestClose={() => setMenuCamadas(false)}>
        <TouchableOpacity style={styles.modalFundo} activeOpacity={1} onPress={() => setMenuCamadas(false)}>
          <View style={styles.modalConteudo}>
            <Text style={styles.modalTitulo}>Camadas do mapa</Text>
            <ScrollView>
              <Text style={styles.modalSecao}>Mapa base</Text>
              {([{ id: 'padrao', nome: 'Padrão', ativo: !satelite }, { id: 'satelite', nome: 'Satélite', ativo: satelite }] as const).map((b) => (
                <TouchableOpacity key={b.id} style={[styles.opcaoCamada, b.ativo && styles.opcaoCamadaAtiva]} onPress={() => setSatelite(b.id === 'satelite')}>
                  <Text style={[styles.opcaoCamadaTexto, b.ativo && styles.opcaoCamadaTextoAtivo]}>{b.nome}</Text>
                </TouchableOpacity>
              ))}

              {wmsAtivas.length > 0 && (
                <>
                  <Text style={styles.modalSecao}>Camadas WMS</Text>
                  {wmsAtivas.map((c) => {
                    const ativo = camadasAtivas.includes(c.id)
                    return (
                      <TouchableOpacity key={c.id} style={[styles.opcaoCamada, ativo && styles.opcaoCamadaAtiva]} onPress={() => alternarCamada(c.id)}>
                        <Text style={[styles.opcaoCamadaTexto, ativo && styles.opcaoCamadaTextoAtivo]}>{ativo ? '☑' : '☐'} {c.nome}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlayTopo: { position: 'absolute', top: 12, right: 12, gap: 8 },
  botaoFlutuante: {
    backgroundColor: 'white', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  botaoFlutuanteTexto: { color: '#1e3a5f', fontWeight: '600', fontSize: 13 },
  overlayCentro: { position: 'absolute', top: 16, left: 16, right: 16, alignItems: 'center' },
  dicaPosicionamento: {
    backgroundColor: 'rgba(30,58,95,0.9)', color: 'white', fontSize: 12, textAlign: 'center',
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
  },
  rodape: { position: 'absolute', bottom: 24, left: 16, right: 16 },
  botaoNovaSolicitacao: {
    backgroundColor: '#1e3a5f', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  botaoNovaSolicitacaoTexto: { color: 'white', fontSize: 16, fontWeight: '700' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  modalConteudo: { backgroundColor: 'white', borderRadius: 14, padding: 16, maxHeight: 400 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#1e3a5f', marginBottom: 10 },
  modalSecao: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginTop: 10, marginBottom: 4 },
  opcaoCamada: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 8 },
  opcaoCamadaAtiva: { backgroundColor: '#e6f0fa' },
  opcaoCamadaTexto: { fontSize: 15, color: '#374151' },
  opcaoCamadaTextoAtivo: { color: '#1e3a5f', fontWeight: '700' },
})
