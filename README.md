# RetroCAM

MVP para transmitir la cámara de un celular a una PC en tiempo real usando WebRTC P2P. Supabase se usa solo para **signaling** (Realtime) y **rooms**; no hay servidores de video ni TURN.

- **PC (viewer)**: crea un room, muestra QR y recibe el stream.
- **Celular (camera)**: escanea el QR, da permisos de cámara y envía el stream.

## Requisitos

- Node.js 18+
- pnpm
- Proyecto [Supabase](https://supabase.com) (cuenta gratuita)

## Variables de entorno

Copia `.env.example` a `.env` y rellena tus credenciales de Supabase:

```bash
cp .env.example .env
```

Edita `.env`:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

Obtén la URL y la anon key en: Supabase Dashboard → Project Settings → API.

## Base de datos (tabla rooms)

En el SQL Editor de tu proyecto Supabase, ejecuta el contenido de:

**`supabase/migrations/20250227000000_create_rooms.sql`**

O bien ejecuta directamente:

```sql
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "Allow anonymous read and insert"
  on public.rooms
  for all
  using (true)
  with check (true);
```

## Cómo correr el proyecto

1. **Instalar dependencias**

   ```bash
   pnpm install
   ```

2. **Configurar `.env`** (ver arriba).

3. **Crear la tabla `rooms`** en Supabase (ver arriba).

4. **Arrancar el servidor de desarrollo**

   ```bash
   pnpm dev
   ```

5. Abre en el navegador la URL que muestre Vite (por defecto `http://localhost:3000`).

## Uso

1. En la **PC**: abre la app → "Crear room" → se abre la vista con un **QR** y el mensaje "Listo para recibir".
2. En el **celular**: escanea el QR (o abre el enlace que se muestra) para ir a la vista cámara.
3. Acepta permisos de cámara en el celular. Verás el preview y "STREAMING LIVE".
4. En la PC debería aparecer el video en tiempo real. Si se pierde la conexión, puedes refrescar la página del celular para que vuelva a enviar la oferta.

## Estructura relevante

```
src/
  lib/
    supabase.ts   # Cliente Supabase, createRoom, canal de signaling
    webrtc.ts     # RTCPeerConnection, offer/answer, ICE (STUN)
  routes/
    index.tsx              # Landing: Crear room → /room/[id]
    room.$roomId.tsx       # Viewer (PC): QR + video remoto
    room.$roomId.camera.tsx # Camera (celular): preview + envío stream
supabase/
  migrations/
    20250227000000_create_rooms.sql
```

## Build para producción

```bash
pnpm build
pnpm preview   # opcional: previsualizar dist
```

## Stack

- Vite + React 19 + TypeScript
- TanStack Router
- Supabase (JS client + Realtime para signaling)
- WebRTC nativo (sin PeerJS ni similares)
- Tailwind CSS
- QRCode (generación del QR en el viewer)
