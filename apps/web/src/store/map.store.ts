import { create } from 'zustand'
import type { Map as LeafletMap } from 'leaflet'

interface MapState {
  map: LeafletMap | null
  selectedParcelaId: string | null
  activeLayers: string[]
  setMap: (map: LeafletMap) => void
  selectParcela: (id: string | null) => void
  toggleLayer: (layerId: string) => void
  flyTo: (lat: number, lng: number, zoom?: number) => void
}

export const useMapStore = create<MapState>((set, get) => ({
  map: null,
  selectedParcelaId: null,
  activeLayers: ['parcelas', 'edificacoes'],
  setMap: (map) => set({ map }),
  selectParcela: (id) => set({ selectedParcelaId: id }),
  toggleLayer: (layerId) =>
    set((state) => ({
      activeLayers: state.activeLayers.includes(layerId)
        ? state.activeLayers.filter((l) => l !== layerId)
        : [...state.activeLayers, layerId],
    })),
  flyTo: (lat, lng, zoom = 18) => {
    get().map?.flyTo([lat, lng], zoom, { animate: true, duration: 0.8 })
  },
}))
