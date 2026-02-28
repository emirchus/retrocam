import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useRef, useState, useEffect } from 'react'
import {
  Video,
  Link as LinkIcon,
  Copy,
  Camera,
  Monitor,
  Settings,
  User,
  HelpCircle,
  Maximize,
  PictureInPicture,
  Volume2,
  FlipHorizontal,
  VideoOff,
  Radio,
} from 'lucide-react'
import {
  getRoom,
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
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [displayCode, setDisplayCode] = useState('------')

  // URL absoluta para OBS Browser Source
  const browserSourceUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${roomId}`
      : ''

  // URL para la cámara (celular)
  const cameraUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${roomId}/camera`
      : ''

  useEffect(() => {
    if (roomId) {
      getRoom(roomId).then((room) => {
        if (room?.short_code) {
          setDisplayCode(`${room.short_code.slice(0, 3)}-${room.short_code.slice(3)}`)
        }
      })
    }
  }, [roomId])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Error copying text')
    }
  }

  // Canal Realtime y lógica WebRTC
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
    <div className="flex h-screen w-full bg-[#0a0f16] text-slate-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[280px] bg-[#111827] border-r border-slate-800 flex flex-col">
        <div className="p-5 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-blue-600 p-1.5 rounded-lg text-white">
            <Video className="w-5 h-5" />
          </div>
          <h1 className="text-white font-bold text-lg tracking-wide">RetroCAM</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {/* Connection */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-500 tracking-wider mb-3">CONNECTION</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Connection Code (Link Mobile)</label>
                <div className="w-full bg-[#0a0f16] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm tracking-widest text-center">
                  {displayCode}
                </div>
              </div>
              <button
                onClick={() => copyToClipboard(cameraUrl)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
              >
                <Radio className="w-4 h-4" />
                <span>Copy Mobile Link</span>
              </button>
            </div>
          </section>

          {/* Video Settings */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-500 tracking-wider mb-3">VIDEO SETTINGS</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Target Resolution</label>
                <select className="w-full bg-[#0a0f16] border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm appearance-none outline-none focus:border-blue-500 cursor-pointer">
                  <option>1080p (FHD)</option>
                  <option>720p (HD)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Frame Rate (FPS)</label>
                <div className="flex p-1 bg-[#0a0f16] rounded-lg border border-slate-800">
                  <button className="flex-1 py-1.5 text-xs font-semibold text-blue-400 bg-blue-600/10 rounded-md">
                    60 FPS
                  </button>
                  <button className="flex-1 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
                    30 FPS
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-slate-400">Digital Zoom</label>
                  <span className="text-xs text-blue-400">1.0x</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 w-1/4"></div>
                </div>
              </div>
            </div>
          </section>

          {/* Streamer Tools */}
          <section>
            <h2 className="text-[10px] font-bold text-slate-500 tracking-wider mb-3">STREAMER TOOLS</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[#0a0f16] border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm flex items-center gap-2 overflow-hidden whitespace-nowrap">
                  <LinkIcon className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="truncate">OBS Browser Source</span>
                </div>
                <button
                  onClick={() => copyToClipboard(browserSourceUrl)}
                  className="bg-[#0a0f16] border border-slate-700 hover:border-slate-500 text-slate-400 rounded-lg p-2.5 transition-colors"
                  title="Copy OBS Url"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <button className="w-full bg-[#0a0f16] border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-2.5 text-slate-300 text-sm flex items-center gap-2 transition-colors">
                <Camera className="w-4 h-4 text-slate-500" />
                <span>Capture Screenshot</span>
              </button>
            </div>

            {copied && <p className="text-xs text-green-400 mt-2">Enlace copiado!</p>}
          </section>
        </div>

        {/* Sidebar Footer */}
        <div className="p-5 border-t border-slate-800">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500">Status</span>
            <div className="flex items-center gap-1.5 font-medium">
              <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-slate-600'}`}></div>
              <span className={status === 'connected' ? 'text-green-400' : 'text-slate-400'}>
                {status === 'connected' ? 'CONNECTED' : status.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs mt-2">
            <span className="text-slate-500">Latency</span>
            <span className="text-slate-400 font-mono">-- ms</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-[#0a0f16]/80 backdrop-blur z-10 absolute top-0 left-0 right-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-white">
              <Monitor className="w-4 h-4" />
              <span className="font-medium text-sm">Receiver Node #{displayCode.split('-')[0] || '12'}</span>
            </div>
            <div className="h-4 w-px bg-slate-700"></div>
            <nav className="flex gap-4">
              <button className="text-blue-400 font-medium text-sm border-b-2 border-blue-500 py-5">
                Monitor
              </button>
              <button className="text-slate-400 hover:text-slate-200 font-medium text-sm py-5 transition-colors">
                Gallery
              </button>
              <button className="text-slate-400 hover:text-slate-200 font-medium text-sm py-5 transition-colors">
                Logs
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <button className="hover:text-white transition-colors"><HelpCircle className="w-4 h-4" /></button>
            <button className="hover:text-white transition-colors"><Settings className="w-4 h-4" /></button>
            <div className="w-7 h-7 rounded-full bg-blue-900/30 flex items-center justify-center text-blue-400 ml-2">
              <User className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* Video Area */}
        <div className="flex-1 bg-[#05080c] relative flex items-center justify-center pt-16 pb-12 overflow-hidden">

          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}
            className={`w-full h-full object-contain ${status === 'connected' ? 'opacity-100' : 'opacity-0'}`}
          />

          {status !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-20 h-20 border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center mb-6 bg-slate-800/20">
                <VideoOff className="w-8 h-8 text-slate-500" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Ready to Receive</h2>
              <p className="text-slate-400 text-sm max-w-md text-center mb-6 leading-relaxed">
                Enter a connection code from your 'WebCam Share' broadcaster to begin the low-latency monitoring feed.
              </p>
              <div className="flex items-center gap-4 w-64">
                <div className="h-px flex-1 bg-slate-800"></div>
                <span className="text-[10px] font-bold tracking-widest text-slate-500">
                  {status === 'waiting' || status === 'reconnecting' ? 'WAITING FOR STREAM' : 'CONNECTING...'}
                </span>
                <div className="h-px flex-1 bg-slate-800"></div>
              </div>

              {error && (
                <p className="mt-6 text-sm text-red-400 bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Floating Controls Overlay */}
          {status === 'connected' && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#111827]/80 backdrop-blur-md border border-slate-700/50 rounded-2xl px-4 py-2.5 flex items-center gap-4 shadow-2xl">
              <button className="text-slate-400 hover:text-white p-1.5 transition-colors"><Maximize className="w-4 h-4" /></button>
              <button className="text-slate-400 hover:text-white p-1.5 transition-colors"><PictureInPicture className="w-4 h-4" /></button>
              <button className="text-slate-400 hover:text-white p-1.5 transition-colors"><Volume2 className="w-4 h-4" /></button>
              <div className="w-px h-4 bg-slate-700 mx-1"></div>
              <button className="text-slate-400 hover:text-white p-1.5 transition-colors"><FlipHorizontal className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="h-8 border-t border-slate-800 bg-[#0a0f16] flex items-center justify-between px-6 text-[10px] tracking-wide font-medium text-slate-500 absolute bottom-0 left-0 right-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-green-500' : 'bg-slate-600'}`}></div>
              <span>BITRATE: {status === 'connected' ? '2.4 MBPS' : '0 KBPS'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
              <span>PROTOCOL: WEBRTC</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
              <span>CODEC: H.264</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span>SERVER: P2P</span>
            <span className="text-blue-500 font-bold">V1.0.0 MVP</span>
          </div>
        </footer>
      </main>
    </div>
  )
}
