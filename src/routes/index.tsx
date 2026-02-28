import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createRoom } from '#/lib/supabase'
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
      const roomId = await createRoom()
      await navigate({ to: '/room/$roomId', params: { roomId } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="mx-auto max-w-md rounded-2xl bg-[var(--surface)] p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-bold text-[var(--sea-ink)]">
          RetroCAM
        </h1>
        <p className="mb-6 text-sm text-[var(--sea-ink-soft)]">
          Transmite la cámara de tu celular a esta PC en tiempo real.
        </p>
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={loading}
          className="w-full rounded-xl bg-[var(--lagoon-deep)] px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Creando sala…' : 'Crear room'}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  )
}
