import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: { background: '#04060C', color: '#E8ECF8', fontFamily: 'monospace', padding: 40, minHeight: '100vh' }
      },
        React.createElement('h2', { style: { color: '#F97316', marginBottom: 16 } }, 'App Error'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 13, color: '#F43F5E' } },
          this.state.error?.message + '\n\n' + this.state.error?.stack
        )
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
