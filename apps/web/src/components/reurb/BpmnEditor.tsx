import { useEffect, useRef } from 'react'
import Modeler from 'bpmn-js/lib/Modeler'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css'

const DIAGRAMA_VAZIO = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1" targetNamespace="http://sigweb.tupanciretã/reurb">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Abertura do processo" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="172" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

// Editor visual de fluxos BPMN (req 189) — wrapper do bpmn-js Modeler.
// `reloadKey` força recriação do modeler ao trocar de fluxo (evita reimportar a cada edição)
export function BpmnEditor({ xml, reloadKey, onChange }: { xml: string; reloadKey: string; onChange: (xml: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const modeler = new Modeler({ container: containerRef.current })

    modeler.importXML(xml || DIAGRAMA_VAZIO).then(() => {
      ;(modeler.get('canvas') as any).zoom('fit-viewport')
    }).catch(() => {})

    const handleChange = async () => {
      try {
        const { xml: novoXml } = await modeler.saveXML({ format: true })
        if (novoXml) onChange(novoXml)
      } catch { /* diagrama em estado intermediário — ignora */ }
    }
    modeler.on('commandStack.changed', handleChange)

    return () => modeler.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  return <div ref={containerRef} style={{ height: '100%', width: '100%', background: '#fff' }} />
}
