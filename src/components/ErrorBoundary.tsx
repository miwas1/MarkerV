import { Component, type ErrorInfo, type ReactNode } from 'react'
import { formatFriendlyFirestoreError } from '../storage/submissionLinks'
import { Notice } from '../ui'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error boundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const friendly = formatFriendlyFirestoreError(
        this.state.error,
        'An unexpected error occurred while loading this view.',
      )
      return (
        <section className="panel form-panel" style={{ maxWidth: 640, margin: '32px auto' }}>
          <h2>Something went wrong</h2>
          <Notice error>{friendly}</Notice>
          <div className="button-row">
            <button
              type="button"
              className="button primary"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </section>
      )
    }
    return this.props.children
  }
}
