import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useRef, useState, useEffect } from 'react'
import { getRoom, getSignalingChannel, sendSignalingMessage, SIGNALING_EVENTS } from '#/lib/supabase'
import type { SignalingPayload } from '#/lib/supabase'
import {
  createPeerConnection,
  createOffer,
  applyRemoteDescription,
  addIceCandidate,
  onIceCandidate,
  setVideoSendParams,
  setSdpVideoBitrate,
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

  // Código legible: desde short_code de la DB o derivado del id
  const displayCode =
    roomId.length >= 6
      ? `${roomId.replace(/-/g, '').slice(0, 3).toUpperCase()} - ${roomId.replace(/-/g, '').slice(3, 6).toUpperCase()}`
      : roomId.slice(0, 8).toUpperCase()
  const [displayCodeFromDb, setDisplayCodeFromDb] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) return
    getRoom(roomId).then((room) => {
      if (room?.short_code) {
        setDisplayCodeFromDb(room.short_code.length >= 6 ? `${room.short_code.slice(0, 3)} - ${room.short_code.slice(3, 6)}` : room.short_code)
      }
    })
  }, [roomId])
  const codeToShow = displayCodeFromDb ?? displayCode

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

    const channel = getSignalingChannel(roomId)

    // Supabase puede pasar el payload directo o como message.payload
    const getPayload = (msg: unknown): SignalingPayload =>
      (msg != null && typeof msg === 'object' && 'payload' in msg
        ? (msg as { payload: SignalingPayload }).payload
        : msg) as SignalingPayload

    // Suscribirse primero para no perder la answer; luego enviar la oferta
    channel
      .on(
        'broadcast',
        { event: SIGNALING_EVENTS.ANSWER },
        async (msg: unknown) => {
          const p = getPayload(msg)
          if (p.type !== 'answer') return
          const pc = pcRef.current
          if (!pc) return
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
        async (msg: unknown) => {
          const p = getPayload(msg)
          if (p.type !== 'ice-candidate') return
          const pc = pcRef.current
          if (!pc) return
          try {
            await addIceCandidate(pc, p.candidate)
          } catch {
            /* ignorar */
          }
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return
        start()
      })

    async function start() {
      let stream: MediaStream
      try {
        // Intentar buena calidad; si falla (Could not start video source), usar restricciones mínimas
        const tryGetUserMedia = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
          try {
            return await navigator.mediaDevices.getUserMedia(constraints)
          } catch (e) {
            if (constraints.video && typeof constraints.video === 'object' && ('width' in constraints.video || 'frameRate' in constraints.video)) {
              return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            }
            throw e
          }
        }
        stream = await tryGetUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
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

      // Calidad: bitrate alto (API + SDP) y 30 fps
      await setVideoSendParams(pc, {
        maxBitrate: 5_000_000, // 5 Mbps
        maxFramerate: 30,
      })

      onIceCandidate(pc, (candidate) => {
        sendSignalingMessage(channel, { type: 'ice-candidate', candidate })
      })

      try {
        let offer = await createOffer(pc)
        // Forzar bitrate en SDP (b=AS:) para que el encoder lo respete
        const sdp = setSdpVideoBitrate(offer.sdp ?? '', 5000)
        offer = { type: offer.type, sdp }
        await pc.setLocalDescription(offer)
        sendSignalingMessage(channel, { type: 'offer', sdp: offer })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error creando oferta')
        pc.close()
        pcRef.current = null
      }
    }

    return () => {
      channel.unsubscribe()
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      const s = streamRef.current
      if (s) {
        for (const track of s.getTracks()) track.stop()
      }
      streamRef.current = null
    }
  }, [roomId])

  return (
    <main className="flex min-h-screen flex-col bg-[var(--bg-base)] p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--sea-ink)]">
          RetroCAM
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
          {codeToShow}
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
