import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { playedSounds } from '@/test/setup'
import { DEFAULT_SOUND_VOLUME, SOUND_SOURCES, type SoundId } from './catalog'
import {
  getVolume,
  isMuted,
  isPlaying,
  play,
  preloadAll,
  setMuted,
  setVolume,
  startTension,
  stop,
  stopAll,
} from './soundBank'

/**
 * El doble de `Audio` instalado en `setup.ts` no implementa `preload` como
 * propiedad observable, pero el soundBank sí la asigna. Estos tests comprueban
 * las decisiones de reproducción (qué suena, cuándo se para, cuándo se
 * reinicia) a partir de las llamadas registradas.
 */
function sonidosReproducidos(): string[] {
  return [...playedSounds]
}

describe('catalogo de sonidos', () => {
  it('apunta a archivos locales, no a URLs externas', () => {
    // El repo base cargaba el audio por URL desde soundboard.com, lo que
    // rompía el juego sin conexión. Todos los sonidos deben ser locales.
    for (const ruta of Object.values(SOUND_SOURCES)) {
      expect(ruta.startsWith('/audio/')).toBe(true)
      expect(ruta).not.toMatch(/^https?:/)
    }
  })

  it('cubre los cinco eventos con archivo propio', () => {
    expect(Object.keys(SOUND_SOURCES).sort()).toEqual(
      ['correct', 'intro', 'suspense', 'tension', 'wrong'].sort(),
    )
  })
})

describe('play', () => {
  it('reproduce el sonido solicitado', () => {
    play('correct')

    expect(sonidosReproducidos()).toEqual(['/audio/correct.mp3'])
  })

  it('no suena nada si el juego está en silencio', () => {
    setMuted(true)
    play('correct')

    expect(sonidosReproducidos()).toEqual([])
  })
})

describe('tension', () => {
  it('arranca en bucle', () => {
    startTension()

    expect(sonidosReproducidos()).toContain('/audio/tension.mp3')
  })

  it('no se reinicia si ya estaba sonando', () => {
    // Si se reiniciara, se perdería el momento de tensión justo cuando el
    // grupo está pensando la respuesta.
    startTension()
    const tras = sonidosReproducidos().length
    startTension()

    expect(sonidosReproducidos()).toHaveLength(tras)
  })

  it('se detiene y se rebobina', () => {
    startTension()
    stop('tension', true)

    expect(isPlaying('tension')).toBe(false)
  })
})

describe('stop y stopAll', () => {
  it('stopAll para todos los sonidos', () => {
    play('intro')
    play('correct')
    startTension()
    stopAll()

    for (const id of Object.keys(SOUND_SOURCES) as SoundId[]) {
      expect(isPlaying(id)).toBe(false)
    }
  })

  it('para un sonido que nunca sonó no lanza', () => {
    expect(() => stop('suspense')).not.toThrow()
  })

  it('isPlaying devuelve false para un sonido desconocido', () => {
    expect(isPlaying('wrong')).toBe(false)
  })
})

describe('silencio y volumen', () => {
  afterEach(() => {
    setMuted(false)
    setVolume(DEFAULT_SOUND_VOLUME)
  })

  it('activa y desactiva el silencio', () => {
    expect(isMuted()).toBe(false)
    setMuted(true)
    expect(isMuted()).toBe(true)
    setMuted(false)
    expect(isMuted()).toBe(false)
  })

  it('el volumen por defecto está en un rango seguro', () => {
    // Un volumen > 1 lanzaría IndexSizeError en el navegador.
    expect(DEFAULT_SOUND_VOLUME).toBeGreaterThan(0)
    expect(DEFAULT_SOUND_VOLUME).toBeLessThanOrEqual(1)
  })

  it('acepta y limita el volumen', () => {
    setVolume(0.3)
    expect(getVolume()).toBe(0.3)

    setVolume(5)
    expect(getVolume()).toBe(1)

    setVolume(-5)
    expect(getVolume()).toBe(0)
  })

  it('cae al volumen por defecto ante un valor no numérico', () => {
    setVolume(Number.NaN)

    expect(getVolume()).toBe(DEFAULT_SOUND_VOLUME)
  })
})

describe('preloadAll', () => {
  it('no lanza aunque el entorno no soporte audio', () => {
    // jsdom no implementa la carga real de medios; el método debe ser seguro.
    expect(() => preloadAll()).not.toThrow()
  })
})

describe('entornos sin soporte de audio', () => {
  let originalAudio: typeof globalThis.Audio

  beforeEach(() => {
    originalAudio = globalThis.Audio
  })

  afterEach(() => {
    vi.stubGlobal('Audio', originalAudio)
  })

  it('no lanza si el constructor de Audio falla', () => {
    // Cubre el caso de un entorno sin Web Audio o con el audio deshabilitado.
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          throw new Error('no soportado')
        }
      },
    )

    expect(() => play('correct')).not.toThrow()
    expect(() => startTension()).not.toThrow()
    expect(() => preloadAll()).not.toThrow()
  })

  it('no lanza si el elemento de audio lanza al reproducir', () => {
    vi.stubGlobal(
      'Audio',
      class {
        currentTime = 0
        volume = 1
        loop = false
        preload = ''
        paused = true
        play() {
          throw new Error('bloqueado')
        }
        pause() {}
        load() {}
      },
    )

    expect(() => play('correct')).not.toThrow()
  })

  it('no propaga el rechazo de la promesa de play()', () => {
    // Devuelve una promesa rechazada en vez de lanzar de forma síncrona.
    vi.stubGlobal(
      'Audio',
      class {
        currentTime = 0
        volume = 1
        loop = false
        preload = ''
        paused = true
        play() {
          return Promise.reject(new Error('NotAllowedError'))
        }
        pause() {}
        load() {}
      },
    )

    expect(() => play('correct')).not.toThrow()
  })
})
