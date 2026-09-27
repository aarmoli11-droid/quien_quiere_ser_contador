import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  closeAudio,
  isSuspended,
  playAnswerRegistered,
  playOptionReveal,
  playTimeUp,
  unlockAudio,
} from './sfx'

/**
 * Doble de `AudioContext` que registra lo que se programa, de modo que se
 * pueda comprobar qué notas suenan y que no se lanzo ninguna excepción.
 */
interface FakeContext {
  state: AudioContextState
  currentTime: number
  destination: unknown
  // `frequency` es un AudioParam en la API real, por eso se guarda el objeto
  // con su `value` y no un número suelto.
  oscillators: { type: OscillatorType; frequency: { value: number } }[]
  closed: boolean
  createOscillator: () => unknown
  createGain: () => unknown
  resume: () => Promise<void>
  close: () => Promise<void>
}

function installFakeAudioContext(state: AudioContextState = 'running'): FakeContext {
  const ctx: FakeContext = {
    state,
    currentTime: 0,
    destination: {},
    oscillators: [],
    closed: false,
    createOscillator: () => {
      const node = {
        type: 'sine' as OscillatorType,
        frequency: { value: 0 },
        // Gains y osciladores se conectan entre sí; el doble solo necesita
        // aceptar las llamadas y no propagar.
        connect: () => node,
        start: () => {},
        stop: () => {},
      }
      ctx.oscillators.push(node)
      return node
    },
    createGain: () => {
      const node = {
        gain: {
          value: 0,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => node,
      }
      return node
    },
    resume: () => {
      ctx.state = 'running'
      return Promise.resolve()
    },
    close: () => {
      ctx.closed = true
      return Promise.resolve()
    },
  }

  vi.stubGlobal('AudioContext', class {
    constructor() {
      return ctx
    }
  })

  return ctx
}

describe('sonidos sintetizados', () => {
  afterEach(() => {
    closeAudio()
    vi.unstubAllGlobals()
  })

  it('suena un blip al mostrar cada opción, con tono ascendente', () => {
    const ctx = installFakeAudioContext()

    playOptionReveal(0)
    playOptionReveal(1)
    playOptionReveal(2)

    // Tres notas, cada una más aguda que la anterior: así se percibe que las
    // opciones van apareciendo en orden.
    expect(ctx.oscillators).toHaveLength(3)
    const frecuencias = ctx.oscillators.map((o) => o.frequency.value)
    expect(frecuencias[0]).toBeLessThan(frecuencias[1] ?? 0)
    expect(frecuencias[1]).toBeLessThan(frecuencias[2] ?? 0)
  })

  it('suena la alerta de tiempo agotado con dos tonos', () => {
    const ctx = installFakeAudioContext()

    playTimeUp()

    // El segundo tono se retrasa con un temporizador de 200 ms.
    expect(ctx.oscillators).toHaveLength(1)
  })

  it('suena un clic al registrar la respuesta de un grupo', () => {
    const ctx = installFakeAudioContext()

    playAnswerRegistered()

    expect(ctx.oscillators).toHaveLength(1)
  })

  it('acepta un índice de opción inválido sin lanzar', () => {
    installFakeAudioContext()

    expect(() => playOptionReveal(-5)).not.toThrow()
    expect(() => playOptionReveal(Number.NaN)).not.toThrow()
    expect(() => playOptionReveal(999)).not.toThrow()
  })

  it('reutiliza el mismo contexto entre llamadas', () => {
    // Un contexto por reproducción agotaría el límite de recursos de audio
    // del navegador en las primeras preguntas.
    installFakeAudioContext()

    playOptionReveal(0)
    playOptionReveal(1)

    expect(isSuspended()).toBe(false)
  })
})

describe('contexto suspendido', () => {
  afterEach(() => {
    closeAudio()
    vi.unstubAllGlobals()
  })

  it('intenta reanudarlo al desbloquear', async () => {
    const ctx = installFakeAudioContext('suspended')

    unlockAudio()
    await Promise.resolve()

    expect(ctx.state).toBe('running')
  })

  it('reanuda también al sonar un efecto', async () => {
    // Sin este resume, tras recargar la página no se oye nada en Chrome.
    const ctx = installFakeAudioContext('suspended')

    playOptionReveal(0)
    await Promise.resolve()

    expect(ctx.state).toBe('running')
  })
})

describe('entornos sin Web Audio', () => {
  afterEach(() => {
    closeAudio()
    vi.unstubAllGlobals()
  })

  it('no lanza si AudioContext no existe', () => {
    vi.stubGlobal('AudioContext', undefined)

    expect(() => playOptionReveal(0)).not.toThrow()
    expect(() => playTimeUp()).not.toThrow()
    expect(() => playAnswerRegistered()).not.toThrow()
    expect(() => unlockAudio()).not.toThrow()
  })

  it('no lanza si el constructor de AudioContext falla', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('política de autoplay')
        }
      },
    )

    expect(() => playOptionReveal(0)).not.toThrow()
    expect(() => unlockAudio()).not.toThrow()
  })

  it('no lanza si falla la construcción de los nodos', () => {
    installFakeAudioContext()
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          return {
            state: 'running',
            currentTime: 0,
            destination: {},
            createOscillator: () => {
              throw new Error('sin recursos de audio')
            },
            createGain: () => ({}),
            resume: () => Promise.resolve(),
            close: () => Promise.resolve(),
          }
        }
      },
    )

    expect(() => playOptionReveal(0)).not.toThrow()
  })

  it('no lanza al cerrar un contexto inexistente', () => {
    vi.stubGlobal('AudioContext', undefined)

    expect(() => closeAudio()).not.toThrow()
    expect(() => closeAudio()).not.toThrow()
  })

  it('isSuspended devuelve false si no hay contexto', () => {
    vi.stubGlobal('AudioContext', undefined)

    expect(isSuspended()).toBe(false)
  })
})
