# Alerta 116 — Operaciones bomberiles

App web instalable (PWA) para bomberos voluntarios del Perú: emergencias en tiempo real, radio en vivo,
alertas push cercanas y por compañía, briefing operativo e identificación de materiales peligrosos con IA.

> App independiente; **no es un canal oficial del CGBVP**.

## Módulos

| Pantalla | Qué hace |
| --- | --- |
| **En vivo** (`/`) | Emergencias del SGO (24 h) en lista + mapa, filtros por tipo, búsqueda, orden por cercanía, resumen de situación |
| **Detalle** (`/emergencia/[parte]`) | Cronómetro, ruta Google Maps/Waze, unidades, compartir, **lo dicho por radio (resumen + cronología)** y briefing con IA |
| **Radio** (`/radio`) | Canales de la Central (IV CDLC), indicador de transmisión, selectivas, **transcripción en vivo del Canal 2**; sigue sonando al navegar y en segundo plano |
| **MatPel** (`/matpel`) | Identificación por N° ONU, nombre o foto; guía GRE, NFPA, EPP, aislamiento. Tabla local sin conexión |
| **Alertas** (`/alertas`) | Push con la app cerrada: emergencias en tu radio y despachos/selectivas de tu compañía |

## Arquitectura

```
SGO CGBVP (público) ──► Monitor (servidor, 1 consulta/min) ──► SSE /api/stream ──► todos los clientes
                                   │
                                   ├─► Web Push (VAPID) a suscriptores en el radio o de la compañía
                                   └─► OpenAI (briefing, situación, MatPel) — con respaldo local si falla
Radio Icecast (radio.lenznetwork.com) ──► navegador directo (CORS abierto)
            └─► Transcriptor (servidor): Canal 2 + feed /actividad ──► Whisper ──► vínculo con la emergencia ──► SSE
```

### Transcripción de la radio (Whisper)

- `src/lib/server/radio/transcriptor.ts`: el servidor escucha los Canales 1 a 4 24/7. Por defecto usa el stream
  «Scan 1-4» (una sola conexión) y etiqueta cada transmisión con el canal que hablaba según el feed de actividad; si dos
  canales hablan a la vez se marca como superpuesta (⚠). Con `RADIO_FUENTE=canales` usa un stream por canal (audio
  limpio aunque hablen a la vez, 4 conexiones). C2 es la Central (despacho); C1/C3/C4, operaciones. El feed `/actividad` del receptor
  indica cuándo hay portadora; solo se recortan y transcriben esas transmisiones (no se paga por silencio). El audio llega
  ~0,5 s después de la marca de actividad (medido). Intercambios con huecos ≤ 3 s se agrupan.
- Filtros anti-alucinación: confianza de cada fragmento de Whisper (`no_speech_prob`, `avg_logprob`), frases típicas
  ("subtítulos…") y eco del prompt.
- Vínculo con la emergencia: primero por código de unidad ("Ambulancia 138-2" ↔ `AMB138-2` del SGO); si no hay código,
  la IA lo intenta con dirección, distrito y contexto (y reintenta cuando aparece una emergencia nueva en el SGO).
- Costo: whisper-1 ≈ US$0,006 por minuto de audio. En las pruebas el Canal 2 tuvo voz ~20 % del tiempo ≈ US$1,6/día.
  Tope diario configurable para todos los canales (`RADIO_MAX_MIN_DIA`, por defecto 720 min ≈ US$4,3/día).
- Las transcripciones pueden contener direcciones y datos de personas: se guardan solo 24 h.

### Selectivas por estación

- `src/lib/server/radio/selectivas.ts`: guarda el historial de selectivas del Canal 2 (el JSON de origen solo trae ~60)
  e identifica la estación de cada par de tonos. Pares confirmados en `src/lib/estaciones.ts` (`PARES_CONFIRMADOS`)
  junto con las 14 estaciones de la IV CDLC.
- Pares desconocidos: se aprenden cruzando cada selectiva con los partes del SGO y las transmisiones de los minutos
  siguientes. La Central llama a varias compañías seguidas para una misma emergencia y las estaciones muy activas
  aparecen cerca de casi todo, así que se exige ≥ 3 coincidencias, ≥ 60 % de las apariciones y lift ≥ 2 respecto
  de la tasa base, con asignación uno a uno. Validado a ciegas con los pares conocidos: sin falsos positivos.
- Push «la Central llama a tu compañía» con la app cerrada (si la estación está en la IV CDLC).

- `src/lib/server/monitor.ts`: sondeo único del SGO, detección de nuevas/actualizadas, *backoff* ante fallos o bloqueo.
- `src/lib/server/sgo.ts`: parser del SGO (coordenadas, distrito, unidades, compañías).
- `src/lib/server/ia.ts`: OpenAI con salidas estructuradas; si no hay saldo, se pausa 10 min y usa guías locales.
- `src/lib/server/push.ts`: suscripciones y envío push.
- `src/lib/matpel-ref.ts`: referencia rápida ONU → guía GRE (contrasta la respuesta de la IA).
- Datos persistentes en `data/*.json` (suscripciones, caché de briefings). Para varios servidores, migrar a Postgres.

## Configuración (`.env.local`)

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL_RAPIDO=gpt-5.4-mini     # briefing y situación
OPENAI_MODEL_EXPERTO=gpt-5.4-mini    # MatPel (visión); gpt-5.4 es más lento (~20 s)
# OPENAI_ESFUERZO_MATPEL=low        # none | low | medium
VAPID_PUBLIC_KEY=...                 # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu-correo@dominio.pe
SGO_POLL_MS=60000                    # mínimo 30000
# MONITOR_DESACTIVADO=1              # no consultar el SGO (desarrollo de UI)
# RADIO_TRANSCRIPCION=0              # desactiva la transcripción de la radio
# RADIO_MODELO_TRANSCRIPCION=whisper-1
# RADIO_FUENTE=scan                  # scan (1 stream "Scan 1-4") | canales (1 stream por canal)
# RADIO_CANALES=C-2,C-1,C-3,C-4     # canales a transcribir (por defecto, los 4)
# RADIO_MAX_MIN_DIA=720              # tope diario de minutos transcritos (todos los canales)
```

## Ejecutar

```bash
npm install
npm run build
npm run start          # http://localhost:3000
```

Requiere un servidor Node de larga duración (el monitor corre en segundo plano): VPS, Docker, Railway, etc.
No funciona en plataformas *serverless*. Las notificaciones push exigen **HTTPS** en producción.
En iPhone, las push funcionan solo con la app instalada en la pantalla de inicio (iOS 16.4+).

## Importante antes de publicar

- **SGO**: el portal bloquea IPs que consultan con frecuencia (redirige a `/Home/Forbidden` con reCAPTCHA).
  El servidor hace **una** consulta por minuto para todos los usuarios y espera más tras un bloqueo
  (`GetResume` solo al abrir un detalle, con caché de 10 min). **No corras dos servidores a la vez desde
  la misma IP** (p. ej. `npm run dev` y `npm run start`): cada uno sondea por su cuenta y suman consultas.
  En desarrollo de interfaz usa `MONITOR_DESACTIVADO=1`. El bloqueo observado duró ~2 h.
  Lo recomendable es coordinar con el CGBVP un acceso autorizado. No intentes evadir el bloqueo.
- **Radio**: los streams pertenecen a la IV CDLC / Lenz Network; pedir autorización para usarlos en la app.
- **IA**: es orientativa; prevalecen la GRE, la HDS y las órdenes del oficial al mando.
