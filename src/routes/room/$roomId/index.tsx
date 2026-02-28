import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useRef, useState, useEffect } from 'react'
import QRCode from 'qrcode'
import {
  getSignalingChannel,
  sendSignalingMessage,
  SIGNALING_EVENTS,
  type SignalingPayload,
} from '#/lib/supabase'
import {
  createPeerConnection,
  createAnswer,
  addIceCandidate,
  onIceCandidate,
} from '#/lib/webrtc'
import type { SignalingOffer, SignalingIceCandidate } from '#/lib/supabase'

export const Route = createFileRoute('/room/$roomId/')({
  component: RoomViewer,
})

type ConnectionStatus = 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

function RoomViewer() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<ReturnType<typeof getSignalingChannel> | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('waiting')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // URL absoluta para que el celular escanee el QR
  const cameraUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${roomId}/camera`
      : ''

  // Generar QR
  useEffect(() => {
    if (!cameraUrl) return
    QRCode.toDataURL(cameraUrl, { width: 220, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [cameraUrl])

  // Canal Realtime y lógica WebRTC (viewer: responde a offer, envía answer e ICE)
  useEffect(() => {
    if (!roomId) return

    const channel = getSignalingChannel(roomId)
    channelRef.current = channel

    const cleanupPc = (): void => {
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
    }

    const handleOffer = async (payload: SignalingOffer): Promise<void> => {
      setStatus('connecting')
      cleanupPc()
      const pc = createPeerConnection()
      pcRef.current = pc

      pc.ontrack = (event: RTCTrackEvent) => {
        const video = remoteVideoRef.current
        if (video && event.streams[0]) {
          video.srcObject = event.streams[0]
          setStatus('connected')
        }
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'failed' || state === 'disconnected') {
          setStatus('reconnecting')
          cleanupPc()
        }
      }

      const removeIce = onIceCandidate(pc, (candidate) => {
        sendSignalingMessage(channel, { type: 'ice-candidate', candidate })
      })

      try {
        const answer = await createAnswer(pc, payload.sdp)
        sendSignalingMessage(channel, { type: 'answer', sdp: answer })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error en answer')
        setStatus('waiting')
        removeIce()
        cleanupPc()
      }
    }

    const handleIceCandidate = async (
      payload: SignalingIceCandidate,
    ): Promise<void> => {
      const pc = pcRef.current
      if (!pc) return
      try {
        await addIceCandidate(pc, payload.candidate)
      } catch {
        // Ignorar candidatos llegados tarde
      }
    }

    channel
      .on(
        'broadcast',
        { event: SIGNALING_EVENTS.OFFER },
        (message: { payload: SignalingPayload }) => {
          const p = message.payload
          if (p.type === 'offer') handleOffer(p)
        },
      )
      .on(
        'broadcast',
        { event: SIGNALING_EVENTS.ICE_CANDIDATE },
        (message: { payload: SignalingPayload }) => {
          const p = message.payload
          if (p.type === 'ice-candidate') handleIceCandidate(p)
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
      channelRef.current = null
      cleanupPc()
    }
  }, [roomId])

  return (
    <main className="flex min-h-screen flex-col bg-[var(--bg-base)] p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--sea-ink)]">RetroCAM</h1>
        <button
          type="button"
          onClick={() => navigate({ to: '/' })}
          className="text-sm text-[var(--lagoon-deep)] underline"
        >
          Salir
        </button>
      </header>

      <div className="grid flex-1 gap-6 md:grid-cols-2">
        {/* QR y código */}
        <section className="flex flex-col items-center rounded-xl bg-[var(--surface)] p-6">
          <p className="mb-2 text-sm font-medium text-[var(--sea-ink-soft)]">
            Escanea con tu celular
          </p>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR para abrir la cámara"
              className="rounded-lg border border-[var(--line)]"
            />
          ) : (
            <div className="h-[220px] w-[220px] animate-pulse rounded-lg bg-[var(--line)]" />
          )}
          <p className="mt-3 text-xs text-[var(--sea-ink-soft)]">
            O abre: <span className="font-mono">{cameraUrl}</span>
          </p>
        </section>

        {/* Video remoto */}
        <section className="flex flex-col rounded-xl bg-[var(--surface)] p-6">
          <p className="mb-2 text-sm font-medium text-[var(--sea-ink-soft)]">
            Monitor
          </p>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[var(--sea-ink)]/10">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className="h-full w-full object-contain"
            />
            {status !== 'connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--sea-ink-soft)]">
                <span className="text-4xl opacity-50">📷</span>
                <span>
                  {status === 'waiting' || status === 'reconnecting'
                    ? 'Listo para recibir'
                    : status === 'connecting'
                      ? 'Conectando…'
                      : 'Desconectado'}
                </span>
                <span className="text-xs">Introduce el código en el celular</span>
              </div>
            )}
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--sea-ink-soft)]">
            <span>Estado: {status === 'connected' ? '● CONECTADO' : '● OFFLINE'}</span>
            <span>Protocolo: WebRTC</span>
          </div>
        </section>
      </div>
    </main>
  )
}
