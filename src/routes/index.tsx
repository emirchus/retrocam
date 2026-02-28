import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createRoom, getRoomByShortCode } from '#/lib/supabase'
import { useState } from 'react'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateRoom() {
    setError(null)
    setLoading(true)
    try {
      const room = await createRoom()
      // Navigates to the camera immediately if mobile, or we let the user choose?
      // Since mobile creates the room, let's navigate to camera
      await navigate({ to: '/room/$roomId/camera', params: { roomId: room.id } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando room')
    } finally {
      setLoading(false)
    }
  }

  // Handle entering connection code
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleJoinRoom() {
    if (!joinCode) return
    setError(null)
    setJoining(true)
    try {
      const room = await getRoomByShortCode(joinCode)
      if (!room) {
        throw new Error('Código inválido o sala no encontrada')
      }
      await navigate({ to: '/room/$roomId', params: { roomId: room.id } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al conectar')
    } finally {
      setJoining(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0f16] p-4 text-white">
      <section className="w-full max-w-sm rounded-3xl border border-slate-800 bg-[#111827] p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-center gap-3 text-blue-500">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h1 className="text-2xl font-bold tracking-wide text-white">RetroCAM</h1>
        </div>

        <div className="space-y-6">
          <button
            type="button"
            onClick={handleCreateRoom}
            disabled={loading || joining}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 font-bold tracking-wide text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Transmitir Cámara (Móvil)'}
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="mx-4 flex-shrink text-xs font-bold tracking-widest text-slate-500">O RECIBIR</span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Ingresa código (ej. A7B92C)"
              className="w-full rounded-xl border border-slate-700 bg-[#0a0f16] px-4 py-3.5 text-center font-mono text-lg font-bold tracking-widest text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              maxLength={8}
            />
            <button
              type="button"
              onClick={handleJoinRoom}
              disabled={joining || loading || !joinCode}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-transparent px-4 py-3 font-bold tracking-wide text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {joining ? 'Conectando...' : 'Ver Transmisión (PC)'}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
