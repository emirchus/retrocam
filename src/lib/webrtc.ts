/**
 * WebRTC nativo (RTCPeerConnection) para RetroCAM.
 * Sin dependencias externas; solo STUN público. Sin TURN en este MVP.
 */

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

/**
 * Crea una RTCPeerConnection con la config por defecto (STUN).
 * El caller debe registrar icecandidate y ontrack según necesite.
 */
export function createPeerConnection(
  config: RTCConfiguration = RTC_CONFIG,
): RTCPeerConnection {
  return new RTCPeerConnection(config)
}

/**
 * Crea una oferta, la establece como localDescription y la devuelve
 * para enviarla por signaling.
 */
export async function createOffer(
  pc: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  return offer
}

/**
 * Establece la oferta remota, crea la respuesta, la establece como
 * localDescription y la devuelve para enviarla por signaling.
 */
export async function createAnswer(
  pc: RTCPeerConnection,
  remoteOffer: RTCSessionDescriptionInit,
): Promise<RTCSessionDescriptionInit> {
  await pc.setRemoteDescription(
    new RTCSessionDescription(remoteOffer),
  )
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  return answer
}

/**
 * Aplica una descripción remota (offer o answer) a la conexión.
 */
export async function applyRemoteDescription(
  pc: RTCPeerConnection,
  desc: RTCSessionDescriptionInit,
): Promise<void> {
  await pc.setRemoteDescription(new RTCSessionDescription(desc))
}

/**
 * Añade un ICE candidate remoto a la conexión.
 */
export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit,
): Promise<void> {
  await pc.addIceCandidate(new RTCIceCandidate(candidate))
}

/**
 * Callback para icecandidate: devuelve el candidate a enviar por signaling
 * (solo cuando event.candidate no es null).
 */
export function onIceCandidate(
  pc: RTCPeerConnection,
  sendCandidate: (candidate: RTCIceCandidateInit) => void,
): () => void {
  const handler = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) sendCandidate(event.candidate.toJSON())
  }
  pc.addEventListener('icecandidate', handler)
  return () => pc.removeEventListener('icecandidate', handler)
}
