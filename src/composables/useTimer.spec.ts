import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { DEFAULT_SECONDS_PER_QUESTION, useTimer } from './useTimer'

/**
 * Los tests usan el reloj simulado de Vitest, que congela `Date.now` y los
 * temporizadores. Es lo que permite comprobar el agotamiento del tiempo sin
 * esperar 30 segundos reales.
 */
describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Fijar una hora concreta hace que los cálculos sean reproducibles.
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('arranca con los segundos indicados', () => {
    const timer = useTimer()

    timer.start(30)

    expect(timer.total.value).toBe(30)
    expect(timer.remaining.value).toBe(30)
    expect(timer.isRunning.value).toBe(true)
  })

  it('descuenta el tiempo al avanzar el reloj', () => {
    const timer = useTimer()
    timer.start(30)

    vi.advanceTimersByTime(10_000)

    expect(timer.remaining.value).toBe(20)
  })

  it('usa el reloj y no el número de ticks', () => {
    // Caso real: si la pestaña pierde el foco, el navegador ralentiza los
    // intervalos. Un solo tick de 100 ms debe reflejar los 15 s que han pasado
    // en el reloj, porque el cálculo parte de la hora de fin y no de un contador.
    const timer = useTimer()
    timer.start(30)

    vi.setSystemTime(Date.now() + 15_000)
    vi.advanceTimersByTime(100)

    expect(timer.remaining.value).toBe(15)
  })

  it('se agota y avisa una sola vez', () => {
    const onExpire = vi.fn()
    const timer = useTimer(onExpire)
    timer.start(30)

    vi.advanceTimersByTime(30_000)

    expect(timer.remaining.value).toBe(0)
    expect(timer.isExpired.value).toBe(true)
    expect(timer.isRunning.value).toBe(false)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('no vuelve a avisar aunque siga corriendo el reloj', () => {
    const onExpire = vi.fn()
    const timer = useTimer(onExpire)
    timer.start(1)

    vi.advanceTimersByTime(5_000)

    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('se pausa y conserva el tiempo restante', () => {
    const timer = useTimer()
    timer.start(30)
    vi.advanceTimersByTime(10_000)

    timer.pause()

    expect(timer.isPaused.value).toBe(true)
    expect(timer.isRunning.value).toBe(false)
    expect(timer.remaining.value).toBe(20)
  })

  it('no consume tiempo mientras está en pausa', () => {
    const timer = useTimer()
    timer.start(30)
    vi.advanceTimersByTime(10_000)
    timer.pause()

    // Aunque pasen 60 s, la cuenta atrás está congelada.
    vi.advanceTimersByTime(60_000)

    expect(timer.remaining.value).toBe(20)
  })

  it('reanuda desde donde se pausó', () => {
    const timer = useTimer()
    timer.start(30)
    vi.advanceTimersByTime(10_000)
    timer.pause()

    timer.resume()
    vi.advanceTimersByTime(5_000)

    expect(timer.remaining.value).toBe(15)
  })

  it('pausar dos veces no altera el estado', () => {
    const timer = useTimer()
    timer.start(30)
    vi.advanceTimersByTime(10_000)

    timer.pause()
    timer.pause()

    expect(timer.remaining.value).toBe(20)
    expect(timer.isPaused.value).toBe(true)
  })

  it('reanudar sin estar en pausa no hace nada', () => {
    const timer = useTimer()
    timer.start(30)

    timer.resume()

    expect(timer.isPaused.value).toBe(false)
    expect(timer.remaining.value).toBe(30)
  })

  it('no avisa de expiración al pausar después de que venció', () => {
    // Si el anfitrión hace clic en "pausar" justo cuando el reloj venció, la
    // revelación debe haberse disparado ya y exactamente una vez.
    const onExpire = vi.fn()
    const timer = useTimer(onExpire)
    timer.start(1)

    vi.advanceTimersByTime(1_000)
    timer.pause()

    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('reset detiene la cuenta y limpia el estado', () => {
    const timer = useTimer()
    timer.start(30)
    vi.advanceTimersByTime(10_000)

    timer.reset()

    expect(timer.remaining.value).toBe(30)
    expect(timer.isRunning.value).toBe(false)
    expect(timer.isPaused.value).toBe(false)
    expect(timer.isExpired.value).toBe(false)
  })

  it('stop equivale a reset y no lanza nada', () => {
    const timer = useTimer()
    timer.start(30)

    timer.stop()

    expect(timer.isRunning.value).toBe(false)
  })

  it('volver a arrancar permite reutilizarlo en la siguiente pregunta', () => {
    const onExpire = vi.fn()
    const timer = useTimer(onExpire)

    timer.start(1)
    vi.advanceTimersByTime(1_000)
    expect(onExpire).toHaveBeenCalledTimes(1)

    // Segunda pregunta con su propio plazo: al agotarse vuelve a avisar, y solo
    // una vez, como exige que la revelación no se dispare dos veces.
    timer.start(30)
    expect(timer.remaining.value).toBe(30)

    vi.advanceTimersByTime(30_000)
    expect(onExpire).toHaveBeenCalledTimes(2)
    expect(timer.remaining.value).toBe(0)
  })

  it('expone el progreso de 0 a 1', () => {
    const timer = useTimer()
    timer.start(30)

    expect(timer.progress.value).toBe(0)

    vi.advanceTimersByTime(15_000)
    expect(timer.progress.value).toBeCloseTo(0.5, 5)

    vi.advanceTimersByTime(15_000)
    expect(timer.progress.value).toBe(1)
  })

  it('el progreso nunca baja de 0 ni sube de 1', () => {
    const timer = useTimer()
    timer.start(30)

    timer.pause()
    expect(timer.progress.value).toBeGreaterThanOrEqual(0)
    expect(timer.progress.value).toBeLessThanOrEqual(1)
  })
})

describe('useTimer: valores limite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fuerza un minimo de 1 segundo', () => {
    // Con 0 segundos el anfitrion no tendria tiempo de registrar nada.
    const timer = useTimer()
    timer.start(0)

    expect(timer.total.value).toBe(1)
  })

  it('normaliza valores no numericos al valor por defecto', () => {
    const timer = useTimer()
    timer.start(Number.NaN)

    expect(timer.total.value).toBe(DEFAULT_SECONDS_PER_QUESTION)
  })

  it('trunca los decimales', () => {
    const timer = useTimer()
    timer.start(30.9)

    expect(timer.total.value).toBe(30)
  })

  it('funciona con valores negativos', () => {
    const timer = useTimer()
    timer.start(-10)

    expect(timer.total.value).toBe(1)
  })

  it('arranca con 30 segundos si no se indica ninguno', () => {
    const timer = useTimer()
    timer.start()

    expect(timer.total.value).toBe(DEFAULT_SECONDS_PER_QUESTION)
  })
})

describe('useTimer: limpieza del ambito', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deja de correr al destruirse el ambito que lo creo', () => {
    // Sin esta limpieza, el intervalo seguiria vivo tras volver a la pantalla
    // de configuracion y podria disparar la revelacion de una partida
    // inexistente.
    const onExpire = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      useTimer(onExpire).start(1)
    })

    scope.stop()
    vi.advanceTimersByTime(5_000)

    expect(onExpire).not.toHaveBeenCalled()
  })
})
