import type { AppProps } from 'next/app'
import '../styles/globals.css'
import Link from 'next/link'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="min-h-screen">
      <nav className="glass border-b border-white/10 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Slave Node Control
            </Link>
            <div className="flex gap-6">
              <Link href="/" className="hover:text-cyan-400 transition-colors">
                Nodes
              </Link>
              <Link href="/logs" className="hover:text-cyan-400 transition-colors">
                Logs
              </Link>
            </div>
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto px-6 py-8">
        <Component {...pageProps} />
      </main>
    </div>
  )
}
