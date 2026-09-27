import { ref } from 'vue'

import { DEFAULT_SOUND_VOLUME, SOUND_SOURCES, type SoundId } from './catalog'

/**
 * Reproducción de los efectos de sonido del programa.
 *
 * Decisiones de diseño relevantes para la partida:
 *
 * 1. Los sonidos se cargan **una vez** y se reutilizan. Crear un `Audio` por
 *    reproducción hace que en algunos navegadores el primer byte tarde en
 *    llegar y la tensión empiece con un retraso perceptible.
 * 2. `tension` es el único sonido en bucle, porque es la música que suena
 *    mientras los grupos discuten la respuesta. Los demás son de un solo uso.
 * 3. Al parar un sonido se rebobina a 0. Si no, la próxima reproducción
 *    empiece por donde quedó y la "tension" entraría a mitad de compás.
 * 4. Todos los métodos capturan los errores de `play()`. Si el audio está
 *    bloqueado o falta un archivo, el juego debe seguir siendo jugable.
 *
 * Los sonidos sintetizados (blip de opción, alerta de tiempo) no pasan por
 * aquí: viven en `sfx.ts` sobre la Web Audio API.
 */

/** Un `Audio` con la información de cómo debe sonar. */
interface Voice {
  element: HTMLAudioElement
  loop: boolean
}

/** Elementos ya creados, para poder parar todos a la vez. */
const voices = new Map<SoundId, Voice>()

/** `true` si el usuario pidió silencio, útil para presentar sin sonido. */
const muted = ref(false)

/** Volumen general entre 0 y 1. */
const volume = ref(DEFAULT_SOUND_VOLUME)

/** Duración del desvanecido al parar la música, en milisegundos. */
const FADE_MS = 400

/** Temporizadores de desvanecido pendientes, para poder cancelarlos. */
const fadeTimers = new Map<SoundId, ReturnType<typeof setTimeout>>()

/**
 * Crea el elemento de un sonido la primera vez que se usa.
 *
 * Devuelve `null` si el navegador no permite crear el elemento. El constructor
 * va dentro del `try` a propósito: si falla, todos los métodos que lo usan
 * tienen que poder seguir funcionando en silencio en lugar de tumbar la partida
 * a mitad de una pregunta.
 *
 * `preload = 'auto'` hace que el navegador descargue el archivo antes de que
 * suene, que es lo que evita el retraso en la tensión.
 */
function voiceFor(id: SoundId): Voice | null {
  const existente = voices.get(id)
  if (existente !== undefined) return existente

  try {
    const element = new Audio(SOUND_SOURCES[id])
    // Solo la música de tensión se repite; el resto son efectos puntuales.
    element.loop = id === 'tension'
    element.preload = 'auto'
    element.volume = volume.value

    const voice: Voice = { element, loop: element.loop }
    voices.set(id, voice)
    return voice
  } catch {
    // Sin soporte de audio o constructor bloqueado: el juego sigue mudo.
    return null
  }
}

/**
 * Reproduce un sonido de un solo uso.
 *
 * Si el sonido ya está sonando, lo reinicia en vez de superponerlo: pulsar dos
 * veces seguidas el botón de acierto no debe sonar doble.
 */
export function play(id: Exclude<SoundId, 'tension'>): void {
  if (muted.value) return
  const voice = voiceFor(id)
  if (voice === null) return

  cancelFade(id)
  try {
    voice.element.currentTime = 0
    voice.element.volume = volume.value
    // `play()` devuelve una promesa que se rechaza si el navegador bloquea el
    // audio automático; no se espera para no bloquear la interfaz.
    void voice.element.play().catch(() => {
      // Sin audio: el juego continúa. Típico si falta un archivo o si el
      // navegador está en modo silencioso.
    })
  } catch {
    // Algunos entornos lanzan de forma síncrona al reproducir.
  }
}

/**
 * Arranca la música de tensión en bucle.
 *
 * Si ya estaba sonando, no la reinicia: reiniciarla en cada llamada borraría el
 * momento de tensión justo cuando el grupo está a punto de responder.
 */
export function startTension(): void {
  if (muted.value) return
  const voice = voiceFor('tension')
  if (voice === null) return

  cancelFade('tension')
  try {
    voice.element.volume = volume.value
    if (voice.element.paused) {
      void voice.element.play().catch(() => {
        // Audio bloqueado o ausente: se sigue sin música.
      })
    }
  } catch {
    // Entorno sin soporte de audio.
  }
}

/**
 * Detiene un sonido con un desvanecido corto.
 *
 * El desvanecido importa en la tensión: cortarla en seco entre la pregunta y su
 * revelación produce un chasquido audible en el proyector. En los efectos
 * cortos (acierto, fallo) el corte seco es aceptable y da respuesta inmediata,
 * por eso `immediate` está activo en esos casos.
 */
export function stop(id: SoundId, immediate = false): void {
  const voice = voices.get(id)
  if (voice === undefined) return

  cancelFade(id)
  const elemento = voice.element
  if (elemento.paused) return

  if (immediate || FADE_MS <= 0) {
    elemento.pause()
    elemento.currentTime = 0
    return
  }

  // Rampa lineal de volumen a cero durante `FADE_MS`.
  const desde = elemento.volume
  const inicio = Date.now()
  fadeTimers.set(
    id,
    setTimeout(() => {
      fadeTimers.delete(id)
      const transcurrido = Date.now() - inicio
      const progreso = Math.min(1, transcurrido / FADE_MS)
      elemento.volume = desde * (1 - progreso)

      if (progreso < 1) {
        fadeTimers.set(
          id,
          setTimeout(() => {
            fadeTimers.delete(id)
            elemento.pause()
            elemento.currentTime = 0
            elemento.volume = volume.value
          }, FADE_MS - transcurrido),
        )
      } else {
        elemento.pause()
        elemento.currentTime = 0
      }
    }, 40),
  )
}

/** Cancela un desvanecido en curso, si lo hubiera. */
function cancelFade(id: SoundId): void {
  const timer = fadeTimers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    fadeTimers.delete(id)
  }
}

/** Detiene y rebobina todos los sonidos. */
export function stopAll(): void {
  for (const id of voices.keys()) stop(id, true)
}

/** `true` si hay alguna textura sonando. */
export function isPlaying(id: SoundId): boolean {
  const voice = voices.get(id)
  return voice !== undefined && !voice.element.paused
}

/** Activa o desactiva el silencio, parando lo que esté sonando. */
export function setMuted(value: boolean): void {
  muted.value = value
  if (value) stopAll()
}

/** `true` si el juego está en silencio. */
export function isMuted(): boolean {
  return muted.value
}

/**
 * Ajusta el volumen general.
 *
 * Se limita a 0..1 porque un valor fuera de rango lanza `IndexSizeError` en el
 * navegador y dejaría el sonido sin funcionar a media partida.
 */
export function setVolume(value: number): void {
  const seguro = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_SOUND_VOLUME
  volume.value = seguro
  for (const [id, voice] of voices) {
    // No se pisa el volumen durante un desvanecido en curso.
    if (fadeTimers.has(id)) continue
    voice.element.volume = seguro
  }
}

/** Volumen general actual. */
export function getVolume(): number {
  return volume.value
}

/**
 * Precalienta los sonidos.
 *
 * Se llama al pulsar "Iniciar juego". Aprovecha ese clic (único momento en que
 * el navegador autoriza audio automático) para tener los archivos listos antes
 * de la primera pregunta.
 */
export function preloadAll(): void {
  for (const id of Object.keys(SOUND_SOURCES) as SoundId[]) {
    const voice = voiceFor(id)
    if (voice === null) continue
    try {
      voice.element.load()
    } catch {
      // Entorno sin soporte de carga de audio.
    }
  }
}

/**
 * Devuelve el soundbank a su estado inicial.
 *
 * Existe porque el estado (silencio, volumen, elementos de audio creados) vive
 * a nivel de módulo y sobreviviría entre tests, filtrando el silencio de un
 * test al siguiente. Los tests lo llaman en su limpieza para que cada uno parta
 * del mismo punto de partida.
 */
export function resetAudioState(): void {
  stopAll()
  for (const timer of fadeTimers.values()) clearTimeout(timer)
  fadeTimers.clear()
  voices.clear()
  muted.value = false
  volume.value = DEFAULT_SOUND_VOLUME
}
