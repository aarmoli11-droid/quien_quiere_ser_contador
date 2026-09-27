/**
 * Sonidos sintetizados con la Web Audio API.
 *
 * El soundboard del que salen los MP3 del juego no incluye dos sonidos que el
 * programa original sí usa:
 *
 * - el **blip** corto que suena al mostrar cada opción de la pregunta;
 * - la **alerta** que suena cuando se agota el tiempo.
 *
 * Sintetizarlos aquí tiene dos ventajas frente a buscar archivos ajenos: no
 * suman bytes al proyecto y no dependen de audio de terceros. Se construyen con
 * osciladores y ganancias, que es la forma más básica y fiable de la API.
 *
 * Todo el código es opcional: si `AudioContext` no existe o está bloqueado, las
 * funciones devuelven `false` sin lanzar y el juego sigue funcionando mudo.
 */

/** `true` si el navegador permite sintetizar audio. */
function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function'
}

/**
 * Contexto de audio compartido.
 *
 * Se crea una sola vez y de forma perezosa: los navegadores lo cuentan como
 * "recurso de audio" y solo permiten crearlo tras una interacción del usuario.
 * Por eso se construye la primera vez que se pide un sonido, nunca al cargar
 * el módulo.
 */
let context: AudioContext | null = null

/** Devuelve el contexto, creándolo si hace falta. `null` si no hay soporte. */
function getContext(): AudioContext | null {
  if (!isSupported()) return null
  if (context !== null) return context

  try {
    context = new window.AudioContext()
    return context
  } catch {
    // El navegador puede rechazar crear el contexto (política de autoplay).
    return null
  }
}

/**
 * `true` si el contexto existe pero está suspendido.
 *
 * Así ocurre tras una recarga o si el usuario nunca ha interactuado con la
 * página. Chrome y Safari dejan el contexto suspendido hasta que se reanuda
 * desde un gesto, y sin ese `resume()` no se oye absolutamente nada.
 */
export function isSuspended(): boolean {
  return context !== null && context.state === 'suspended'
}

/**
 * Reproduce una nota con envolvente ADSR simplificada.
 *
 * @param frecuencia  Tono en hercios. Más agudo suena más "agudo" y galleta.
 * @param duracion    Duración total en segundos.
 * @param tipoOnda    Forma de onda: 'sine' es suave, 'square' es más metálica.
 * @param volumen     Pico de ganancia, entre 0 y 1.
 * @param cuando      Instante del contexto en el que empieza. Por defecto, ya.
 */
function playNote(
  frecuencia: number,
  duracion: number,
  tipoOnda: OscillatorType,
  volumen: number,
  cuando?: number,
): boolean {
  const ctx = getContext()
  if (ctx === null) return false

  try {
    // Si el contexto está suspendido, se intenta despertar. Es una promesa, y
    // si falla el sonido simplemente no suena.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

    const inicio = cuando ?? ctx.currentTime
    const oscilador = ctx.createOscillator()
    const ganancia = ctx.createGain()

    oscilador.type = tipoOnda
    oscilador.frequency.value = frecuencia

    // Envolvente: ataque corto para que no chasquee, caída exponencial hasta
    // silencio, y silencio antes de cortar para no producir un clic final.
    ganancia.gain.setValueAtTime(0, inicio)
    ganancia.gain.linearRampToValueAtTime(volumen, inicio + 0.01)
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion)
    ganancia.gain.setValueAtTime(0, inicio + duracion)

    oscilador.connect(ganancia)
    ganancia.connect(ctx.destination)
    oscilador.start(inicio)
    oscilador.stop(inicio + duracion + 0.02)

    return true
  } catch {
    // Si la Web Audio falla, el juego sigue sin ese sonido.
    return false
  }
}

/**
 * Blip de aparición de una opción.
 *
 * Tres de ellos cascading (cada uno un poco más agudo) es el sonido
 * característico del programa al mostrar A, B y C seguidas.
 *
 * @param indiceOpcion 0 para la primera opción, 1 para la segunda, etc.
 */
export function playOptionReveal(indiceOpcion: number): void {
  // Escala pentatónica ascendente: suena como "apareciendo" y no como error.
  const escala = [880, 1174.66, 1396.91, 1760]
  const indice = Number.isFinite(indiceOpcion) ? Math.max(0, Math.floor(indiceOpcion)) : 0
  const frecuencia = escala[indice % escala.length] ?? 880

  playNote(frecuencia, 0.12, 'sine', 0.18)
}

/**
 * Alerta de tiempo agotado.
 *
 * Sonan dos tonos descendentes separados: deja claro que el plazo se acabó,
 * sin ser confundible con el sonido de respuesta incorrecta.
 */
export function playTimeUp(): void {
  const ctx = getContext()
  if (ctx === null) return

  playNote(660, 0.18, 'square', 0.12)
  // El segundo tono se retrasa con un temporizador porque la función anterior
  // programa el tono en el instante actual del contexto.
  setTimeout(() => {
    playNote(440, 0.28, 'square', 0.12)
  }, 200)
}

/**
 * Clic discreto al registrar la respuesta de un grupo.
 *
 * Es un sonido distinto del blip de opción porque comunica "tu respuesta quedó
 * anotada", no "te estoy mostrando una opción".
 */
export function playAnswerRegistered(): void {
  playNote(523.25, 0.09, 'triangle', 0.12)
}

/**
 * Fanfarria de victoria.
 *
 * Suena al terminar la partida, mientras el confeti cae. Arpegio mayor ascendente
 * con una quinta final: es el gesto musical que espera cualquiera que haya visto
 * un concurso de televisión, así que comunica la celebración sin necesidad de
 * ninguna palabra.
 *
 * Las notas no se encadenan con `setTimeout` sino con el reloj del contexto: los
 * temporizadores se ralentizan cuando la pestaña pierde el foco (justo lo que
 * pasa en un portátil con el proyector encendido) y entonces los tonos se
 * solaparían y sonarían desordenados. Con `ctx.currentTime` el arpegio dura lo
 * mismo aunque el navegador pause los temporizadores.
 */
export function playVictory(): void {
  const ctx = getContext()
  if (ctx === null) return

  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})

  // Do, mi, sol, do y mi: el arpegio completo de do mayor. La última nota es la
  // más larga porque es la que cierra la fanfarria.
  const notas: ReadonlyArray<{ frecuencia: number; duracion: number }> = [
    { frecuencia: 523.25, duracion: 0.14 }, // do
    { frecuencia: 659.25, duracion: 0.14 }, // mi
    { frecuencia: 783.99, duracion: 0.14 }, // sol
    { frecuencia: 1046.5, duracion: 0.2 }, // do, una octava arriba
    { frecuencia: 1318.51, duracion: 0.45 }, // mi, el remate
  ]

  const inicio = ctx.currentTime
  let acumulado = 0
  for (const nota of notas) {
    playNote(nota.frecuencia, nota.duracion, 'triangle', 0.16, inicio + acumulado)
    acumulado += nota.duracion * 0.72
  }
}

/**
 * Desbloquea el contexto de audio.
 *
 * Se invoca desde el clic de "Iniciar juego", que es el gesto del usuario que
 * autoriza reproducir sonido en todos los navegadores.
 */
export function unlockAudio(): void {
  const ctx = getContext()
  if (ctx === null) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
}

/** Cierra el contexto de audio. Se usa al reiniciar la partida. */
export function closeAudio(): void {
  if (context === null) return
  try {
    void context.close().catch(() => {})
  } catch {
    // Sin efecto si ya estaba cerrado.
  } finally {
    context = null
  }
}
