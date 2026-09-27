import { computed, getCurrentScope, onScopeDispose, readonly, ref } from 'vue'

/**
 * Temporizador de cuenta atrás de una pregunta.
 *
 * Se calcula a partir de la hora del reloj (`Date.now`) y no contando
 * ticks. Es una decisión importante en un juego que se presenta en un
 * proyector: si la pestaña pierde el foco o el navegador ralentiza los
 * `setInterval` (cosa habitual en segundo plano, y muy probable con un
 * portátil conectado al proyector), contar ticks haría que el tiempo
 * corriera más despacio o más rápido de lo announced. Guardando solo la
 * marca de fin y restando, el tiempo real es siempre el real.
 *
 * El temporizador se puede pausar porque el anfitrión necesita tiempo para
 * repetir la pregunta o para que los grupos discutan la respuesta.
 */

/** Valor devuelto por el composable. */
export interface Timer {
  /** Segundos que quedan, redondeados hacia arriba para mostrar 30 → 0. */
  remaining: number
  /** Segundos totales de la pregunta. */
  total: number
  /** Progreso de 0 a 1; 1 significa que se agotó el tiempo. */
  progress: number
  isRunning: boolean
  isPaused: boolean
  isExpired: boolean
  start: (seconds?: number) => void
  pause: () => void
  resume: () => void
  reset: (seconds?: number) => void
  stop: () => void
}

/** Segundos por defecto de cada pregunta, ajustables en la configuración. */
export const DEFAULT_SECONDS_PER_QUESTION = 30

/** Frecuencia de refresco de la pantalla. 100 ms basta para un contador. */
const TICK_MS = 100

/**
 * Normaliza los segundos solicitados a un entero positivo.
 *
 * Una pregunta con 0 o menos segundos dejaría al anfitrión sin margen para
 * registrar respuestas, así que se fuerza un mínimo. Un valor no numérico
 * (por ejemplo un `NaN` venidero del formulario) vuelve al valor por defecto.
 */
function normalizeSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_SECONDS_PER_QUESTION
  return Math.max(1, Math.trunc(seconds))
}

/**
 * Crea un temporizador de cuenta atrás.
 *
 * @param onExpire  Se invoca una única vez cuando el tiempo llega a cero. Es
 *                  el gancho que dispara la revelación de la respuesta.
 */
export function useTimer(onExpire?: () => void): Timer {
  const total = ref(DEFAULT_SECONDS_PER_QUESTION)
  const remainingMs = ref(DEFAULT_SECONDS_PER_QUESTION * 1000)
  const isRunning = ref(false)
  const isPaused = ref(false)

  /** Hora en que termina la pregunta, o `null` si está pausada o detenida. */
  let endAt: number | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null
  /** Evita que `onExpire` se dispare más de una vez por pregunta. */
  let expired = false

  const remaining = computed(() => Math.max(0, Math.ceil(remainingMs.value / 1000)))
  const isExpired = computed(() => remainingMs.value <= 0)
  const progress = computed(() => {
    const totalMs = total.value * 1000
    if (totalMs <= 0) return 1
    return Math.min(1, Math.max(0, 1 - remainingMs.value / totalMs))
  })

  /** Cancela el intervalo activo, si lo hay. */
  function clearTicker(): void {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  /**
   * Vuelve a leer la hora del reloj y, si se agotó el tiempo, detiene el
   * temporizador y avisa. Se llama en cada tick y también tras pausar, para que
   * el valor mostrado sea siempre el correcto.
   */
  function sync(): void {
    if (endAt === null) return

    const left = endAt - Date.now()
    if (left <= 0) {
      remainingMs.value = 0
      clearTicker()
      isRunning.value = false
      endAt = null

      if (!expired) {
        // La marca evita que un clic posterior en "pausar" o un tick repetido
        // dispare la revelación dos veces.
        expired = true
        onExpire?.()
      }
      return
    }
    remainingMs.value = left
  }

  /** Arranca (o reinicia) la cuenta atrás con los segundos indicados. */
  function start(seconds?: number): void {
    const segs = normalizeSeconds(seconds ?? total.value)
    total.value = segs
    remainingMs.value = segs * 1000
    expired = false
    isPaused.value = false
    isRunning.value = true
    endAt = Date.now() + segs * 1000
    clearTicker()
    intervalId = setInterval(sync, TICK_MS)
  }

  /**
   * Detiene la cuenta conservando el tiempo restante.
   *
   * `isRunning` pasa a falso porque, para quien lo consume, "en marcha" debe
   * significar que la cuenta avanza ahora mismo. La pausa se refleja en
   * `isPaused`; tener las dos a `true` a la vez obligaría a comprobar las dos
   * en cada punto de uso.
   *
   * Se sincroniza antes de parar para no congelar un valor que ya venció
   * entre el último tick y el clic.
   */
  function pause(): void {
    if (!isRunning.value || isPaused.value) return
    sync()
    // Si `sync` ya venció el tiempo, `isRunning` quedó en false y no hay nada
    // que pausar: la revelación ya se disparó.
    if (!isRunning.value) return

    isPaused.value = true
    isRunning.value = false
    endAt = null
    clearTicker()
  }

  /** Reanuda desde donde se pausó, con la misma duración total. */
  function resume(): void {
    if (!isPaused.value) return

    isPaused.value = false
    isRunning.value = true
    endAt = Date.now() + remainingMs.value
    clearTicker()
    intervalId = setInterval(sync, TICK_MS)
  }

  /** Detiene y vuelve al estado inicial, sin lanzar nada. */
  function reset(seconds?: number): void {
    clearTicker()
    const segs = normalizeSeconds(seconds ?? total.value)
    total.value = segs
    remainingMs.value = segs * 1000
    endAt = null
    expired = false
    isRunning.value = false
    isPaused.value = false
  }

  /** Igual que `reset`, pero además corta la cuenta atrás en curso. */
  function stop(): void {
    reset()
  }

  // Si el componente que creó el temporizador se desmonta, el intervalo se
  // cancela. Sin esto, seguiría corriendo y dispararía la revelación de una
  // partida que ya no existe (por ejemplo, al volver a la configuración).
  //
  // Solo se registra si hay un ámbito activo: `onScopeDispose` avisa por
  // consola cuando se usa fuera de un componente, y el composable también es
  // válido usar desde un test o desde código sin componente.
  if (getCurrentScope() !== undefined) onScopeDispose(clearTicker)

  return {
    remaining: readonly(remaining),
    total: readonly(total),
    progress: readonly(progress),
    isRunning: readonly(isRunning),
    isPaused: readonly(isPaused),
    isExpired: readonly(isExpired),
    start,
    pause,
    resume,
    reset,
    stop,
  }
}
