import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: 24, background: '#f8fafc', color: '#111827',
        }}>
          <div style={{ maxWidth: 620 }}>
            <h1 style={{ margin: 0, fontSize: 32, color: '#1f2937' }}>Erro ao carregar o SIGWEB</h1>
            <p style={{ marginTop: 14, color: '#4b5563', lineHeight: 1.7 }}>
              O aplicativo encontrou um problema inesperado. Atualize a página ou tente novamente mais tarde.
            </p>
            <pre style={{
              marginTop: 18, padding: 16, borderRadius: 12, background: '#111827', color: '#f8fafc',
              textAlign: 'left', overflowX: 'auto', maxHeight: 300,
            }}>
              {this.state.error?.message}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
