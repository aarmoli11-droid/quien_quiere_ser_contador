/**
 * Configuración global de los tests.
 *
 * jsdom no implementa la Web Audio API ni `Audio`, que son dependencias
 * centrales del juego. En lugar de instalar un motor de audio falso en cada
 * test, se sustituyen por dobles mínimos que registran las llamadas; así los
 * tests pueden afirmar "sonó el sonido X" sin depender de un archivo real.
 */
import { afterEach, vi } from 'vitest'

/** Registro de sonidos reproducidos, para poder inspeccionarlo en los tests. */
export const playedSounds: string[] = []

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
  playedSounds.length = 0
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
