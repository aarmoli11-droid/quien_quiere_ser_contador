/**
 * Configuración global de los tests.
 *
 * jsdom no implementa la Web Audio API ni `Audio`, que son dependencias
 * centrales del juego. En lugar de instalar un motor de audio falso en cada
 * test, se sustituyen por dobles mínimos que registran las llamadas; así los
 * tests pueden afirmar "sonó el sonido X" sin depender de un archivo real.
 *
 * `canvas-confetti` se sustituye por la misma razón y por una más práctica:
 * dibuja en un `<canvas>` del `body` y anima con `requestAnimationFrame`, así que
 * en jsdom falla dentro de su propio bucle de animación, que ya no depende del
 * test que la lanzó. Esos errores aparecen como "no controlados" y pueden dar por
 * buenos tests que en realidad no lo son.
 */
import { afterEach, vi } from 'vitest'

import type { ConfettiOptions } from 'canvas-confetti'

import { resetAudioState } from '@/audio/soundBank'

/** Registro de sonidos reproducidos, para poder inspeccionarlo en los tests. */
export const playedSounds: string[] = []

/** Opciones con las que se ha pedido confeti, para poder inspeccionarlas. */
export const confettiCalls: ConfettiOptions[] = []

vi.mock('canvas-confetti', () => ({
  default: (opciones: ConfettiOptions) => {
    confettiCalls.push(opciones)
  },
}))

/** Instala un doble de `Audio` que registra `play`/`pause`/`stop`. */
function installAudioStub() {
  class AudioStub {
    currentTime = 0
    volume = 1
    loop = false
    paused = true
    src: string

    constructor(src: string) {
      this.src = src
    }

    play(): Promise<void> {
      this.paused = false
      playedSounds.push(this.src)
      return Promise.resolve()
    }

    pause() {
      this.paused = true
    }

    /** Web Audio no usa `stop`; el stub solo existe por simetría de la interfaz. */
    stop() {
      this.paused = true
    }

    load() {}
  }

  vi.stubGlobal('Audio', AudioStub)
  return AudioStub
}

installAudioStub()

/** Reinicia el registro entre tests para que no se contamine de uno a otro. */
afterEach(() => {
  // El soundbank guarda el silencio y el volumen a nivel de módulo, así que sin
  // esta llamada un test que silencie el audio dejaría mudos a todos los
  // siguientes, independientemente del orden en que se ejecuten.
  resetAudioState()
  playedSounds.length = 0
  confettiCalls.length = 0
  vi.unstubAllGlobals()
  installAudioStub()
  // Algunos tests sustituyen `localStorage` por un doble que lanza; limpiarlo
  // aquí sin protección haría fallar el test con un error poco descriptivo en
  // lugar del error real que se quiere comprobar.
  try {
    localStorage.clear()
  } catch {
    // Sin almacenamiento no hay nada que limpiar.
  }
})
