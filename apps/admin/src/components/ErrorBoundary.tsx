"use client"

import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { supabase } from "@/integrations/supabase/client"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[v0] Error caught by boundary:", error, errorInfo)
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    if (host === 'localhost' || host === '127.0.0.1') return
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        await fetch('https://join.getsynth.app/api/ops-alert', {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            kind: 'client',
            surface: 'admin',
            severity: 'bug',
            message: (error?.message || 'Admin render error').slice(0, 500),
            stack: error?.stack?.slice(0, 1200),
            context: typeof errorInfo?.componentStack === 'string' ? errorInfo.componentStack.slice(0, 300) : undefined,
            url: window.location.href.slice(0, 300),
            platform: 'web',
          }),
        })
      } catch {
        // Reporting must never take the admin down with it.
      }
    })()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 text-red-500">
              <AlertTriangle className="w-full h-full" />
            </div>

            <h2 className="text-2xl font-semibold mb-2 text-gray-900">Something went wrong</h2>

            <p className="text-gray-600 mb-6">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>

            <button onClick={() => window.location.reload()} className="btn btn-primary">
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
