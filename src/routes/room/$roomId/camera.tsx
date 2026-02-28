import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useRef, useState, useEffect } from 'react'
import {
  getSignalingChannel,
  sendSignalingMessage,
  SIGNALING_EVENTS,
} from '#/lib/supabase'
import type { SignalingPayload } from '#/lib/supabase'
import {
  createPeerConnection,
  createOffer,
  applyRemoteDescription,
  addIceCandidate,
  onIceCandidate,
} from '#/lib/webrtc'

export const Route = createFileRoute('/room/$roomId/camera')({
  component: RoomCamera,
})

function RoomCamera() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const cameraUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${roomId}/camera`
      : ''

  // Código de sala legible (ej. primeros 8 chars del uuid en formato A7-B92)
  const displayCode = roomId
    ? `${roomId.slice(0, 2).toUpperCase()} - ${roomId.slice(2, 5).toUpperCase()}`
    : ''

  async function copyLink() {
    if (!cameraUrl) return
    try {
      await navigator.clipboard.writeText(cameraUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar')
    }
  }

  useEffect(() => {
    if (!roomId) return

    let stream: MediaStream | null = null
    const channel = getSignalingChannel(roomId)

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        streamRef.current = stream

        const video = localVideoRef.current
        if (video) {
          video.srcObject = stream
        }
        setStreaming(true)
        setError(null)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'No se pudo acceder a la cámara',
        )
        return
      }

      const pc = createPeerConnection()
      pcRef.current = pc

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }

      const removeIce = onIceCandidate(pc, (candidate) => {
        sendSignalingMessage(channel, { type: 'ice-candidate', candidate })
      })

      try {
        const offer = await createOffer(pc)
        sendSignalingMessage(channel, { type: 'offer', sdp: offer })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error creando oferta')
        removeIce()
        pc.close()
        return
      }

      channel
        .on(
          'broadcast',
          { event: SIGNALING_EVENTS.ANSWER },
          async (message: { payload: SignalingPayload }) => {
            const p = message.payload
            if (p.type !== 'answer') return
            try {
              await applyRemoteDescription(pc, p.sdp)
            } catch {
              setError('Error aplicando respuesta')
            }
          },
        )
        .on(
          'broadcast',
          { event: SIGNALING_EVENTS.ICE_CANDIDATE },
          async (message: { payload: SignalingPayload }) => {
            const p = message.payload
            if (p.type !== 'ice-candidate') return
            try {
              await addIceCandidate(pc, p.candidate)
            } catch {
              // Candidatos tardíos se ignoran
            }
          },
        )
        .subscribe()
    }

    start()

    return () => {
      channel.unsubscribe()
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      if (stream) {
        for (const track of stream.getTracks()) track.stop()
      }
      streamRef.current = null
    }
  }, [roomId])

  return (
    <main className="flex min-h-screen flex-col bg-[var(--bg-base)] p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--sea-ink)]">
          RetroCAMs
        </h1>
        <button
          type="button"
          onClick={() => navigate({ to: '/' })}
          className="text-sm text-[var(--lagoon-deep)] underline"
        >
          Salir
        </button>
      </header>

      {/* Preview de cámara */}
      <section className="relative mb-4 flex-1 overflow-hidden rounded-xl bg-[var(--sea-ink)]/10">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {streaming && (
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-xs text-white">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            STREAMING LIVE
          </div>
        )}
      </section>

      {error && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Código y copiar enlace */}
      <section className="rounded-xl bg-[var(--surface)] p-4">
        <p className="mb-1 text-xs font-medium text-[var(--sea-ink-soft)]">
          Código de conexión
        </p>
        <p className="mb-2 font-mono text-2xl font-bold text-[var(--sea-ink)]">
          {displayCode}
        </p>
        <button
          type="button"
          onClick={copyLink}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--foam)] px-4 py-2 text-sm font-medium text-[var(--sea-ink)] transition hover:bg-[var(--sand)]"
        >
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
      </section>
    </main>
  )
}
