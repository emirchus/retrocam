import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import type { Database, Tables } from '#/lib/database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env')
}

export const supabase = createClient<Database>(url, anonKey)

// --- Tipos para la tabla rooms (alineados con DB) ---
export type RoomRow = Tables<'rooms'>

// --- Tipos para signaling (Realtime broadcast) ---
export type SignalingOffer = {
  type: 'offer'
  sdp: RTCSessionDescriptionInit
}

export type SignalingAnswer = {
  type: 'answer'
  sdp: RTCSessionDescriptionInit
}

export type SignalingIceCandidate = {
  type: 'ice-candidate'
  candidate: RTCIceCandidateInit
}

export type SignalingPayload =
  | SignalingOffer
  | SignalingAnswer
  | SignalingIceCandidate

export const SIGNALING_EVENTS = {
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
} as const

// --- Rooms ---

/**
 * Crea un room en Supabase y devuelve su id.
 */
export async function createRoom(): Promise<string> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({})
    .select('id')
    .single()

  if (error) throw new Error(`Error creando room: ${error.message}`)
  if (!data?.id) throw new Error('Room creado sin id')
  return data.id as string
}

/**
 * Comprueba si un room existe (opcional).
 */
export async function getRoom(id: string): Promise<RoomRow | null> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return null
  return data as RoomRow | null
}

// --- Signaling (Realtime) ---

/**
 * Devuelve un canal Realtime para el room, listo para .on() y .subscribe().
 * El caller debe llamar a channel.subscribe() y usar channel.send() para broadcast.
 */
export function getSignalingChannel(roomId: string): RealtimeChannel {
  return supabase.channel(`room:${roomId}`, {
    config: { broadcast: { self: false } },
  })
}

/**
 * Envía un payload de signaling por el canal (broadcast).
 */
export function sendSignalingMessage(
  channel: RealtimeChannel,
  payload: SignalingPayload,
): void {
  const event =
    payload.type === 'offer'
      ? SIGNALING_EVENTS.OFFER
      : payload.type === 'answer'
        ? SIGNALING_EVENTS.ANSWER
        : SIGNALING_EVENTS.ICE_CANDIDATE
  channel.send({
    type: 'broadcast',
    event,
    payload,
  })
}
