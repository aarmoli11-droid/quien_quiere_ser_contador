/**
 * Catálogo de sonidos del juego.
 *
 * Los archivos vienen del soundboard público "WhoWantsToBeAMillionaire-
 * Soundboard" (MIT) y se guardan en `public/audio` para poder jugar sin
 * conexión. El repositorio base original los cargaba por URL desde
 * soundboard.com, lo que hacía que el juego no funcionara sin internet y
 * dependiera de un tercero.
 *
 * Eventos que cubre la aplicación:
 *
 * | Evento                | Archivo      | Uso                                  |
 * |-----------------------|--------------|--------------------------------------|
 * | `intro`               | intro.mp3    | música de entrada de la partida      |
 * | `tension`             | tension.mp3  | tensión en bucle mientras contesta   |
 * | `suspense`            | suspense.mp3 | "tum tum tum" antes de revelar       |
 * | `correct`             | correct.mp3  | respuesta correcta                   |
 * | `wrong`               | wrong.mp3    | respuesta incorrecta o tiempoagotado |
 *
 * El "blip" de cada opción y la alerta de tiempo agotado **no** están en el
 * soundboard; se sintetizan con la Web Audio API en `sfx.ts`.
 */
export type SoundId = 'intro' | 'tension' | 'suspense' | 'correct' | 'wrong'

/** Ruta de cada sonido. Al estar en `public/`, se sirve tal cual en producción. */
export const SOUND_SOURCES: Record<SoundId, string> = {
  intro: '/audio/intro.mp3',
  tension: '/audio/tension.mp3',
  suspense: '/audio/suspense.mp3',
  correct: '/audio/correct.mp3',
  wrong: '/audio/wrong.mp3',
}

/** Volumen inicial. El anfitrión puede ajustarlo durante la partida. */
export const DEFAULT_SOUND_VOLUME = 0.6
