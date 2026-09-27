/**
 * Tipos de dominio del juego.
 *
 * Se concentran aquí porque los comparten el banco de preguntas, la máquina de
 * estados de la partida y todos los componentes. Ningún tipo fija el número de
 * opciones: el banco real tiene 3 (A, B, C), pero el modelo admite 4 para no
 * romper si más adelante se carga una pregunta del formato clásico.
 */

/** Nivel de dificultad declarado por el anfitrión al crear la partida. */
export type Difficulty = 'facil' | 'dificil'

/**
 * Pregunta tal y como se guarda en el banco (sin mezclar).
 *
 * `correctIndex` es el índice de la opción correcta **antes** de mezclar; es
 * un dato del autor de la pregunta, no de la partida. La posición que esa
 * respuesta ocupa en pantalla la calcula `shuffleQuestion` al repartir.
 */
export interface Question {
  id: string
  text: string
  /** Entre 2 y 4 opciones. El banco real usa 3. */
  options: string[]
  /** Índice de la respuesta correcta dentro de `options`, sin mezclar. */
  correctIndex: number
  difficulty: Difficulty
  /** Etiqueta libre para clasificar (ej. "cálculo básico"). Opcional. */
  category?: string
}

/**
 * Pregunta ya repartida para mostrarse en pantalla.
 *
 * `options` está mezclada y `correctIndex` se recalculó para apuntar a la
 * posición visual de la respuesta correcta dentro de ese nuevo orden.
 */
export interface ShuffledQuestion {
  id: string
  text: string
  options: string[]
  /** Índice dentro de `options` ya mezclada. */
  correctIndex: number
  difficulty: Difficulty
  category?: string
  /** Etiquetas A, B, C… correspondientes a `options` ya mezclada. */
  letters: string[]
}

/** Grupo/equipo participating en la partida. */
export interface Group {
  id: string
  /** Nombre libre que escribe el anfitrión (ej. "Los Contadores"). */
  name: string
  /** Etiqueta corta que se muestra en la arena (ej. "Grupo A"). */
  label: string
  /** Puntos acumulados durante toda la partida. */
  score: number
  /**
   * Opción que este grupo registró en la pregunta actual, o `null` si todavía
   * no ha contestado (o si se agotó el tiempo, en cuyo caso queda sin puntos).
   */
  currentAnswer: number | null
}

/** Respuesta que un grupo dio en una pregunta ya resuelta. */
export interface GroupAnswer {
  groupId: string
  /** `null` significa que el grupo no respondió o se agotó el tiempo. */
  optionIndex: number | null
  correct: boolean
  pointsAwarded: number
}

/**
 * Fases de la partida. Es una máquina de estados estricta: el store solo
 * permite avanzar hacia adelante, y la interfaz usa la fase para decidir qué
 * botones mostrar.
 *
 * - `setup`    configuración inicial (grupos, dificultad, nº de preguntas)
 * - `intro`    se anuncia la pregunta antes de abrirla (música de tensión)
 * - `open`     la pregunta está visible y los grupos pueden registrar respuesta
 * - `reveal`   se muestra la correcta y se reparten los puntos
 * - `results`  tabla de posiciones final
 */
export type GamePhase = 'setup' | 'intro' | 'open' | 'reveal' | 'results'

/** Configuración elegida por el anfitrión en la pantalla inicial. */
export interface GameConfig {
  groups: Group[]
  difficulty: Difficulty
  /** Número de preguntas de la partida (sin contar desempates). */
  questionCount: number
  /** Segundos por pregunta. */
  secondsPerQuestion: number
  /** Puntos de la primera pregunta; cada siguiente suma este incremento. */
  basePoints: number
  /** Incremento de puntos entre preguntas consecutivas. */
  pointsStep: number
  /** Dificultad de las preguntas de desempate. */
  tiebreakDifficulty: Difficulty
}

/** Rango válido de opciones por pregunta; el modelo no impone un número fijo. */
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 4

/** Etiquetas visibles de las opciones, en el orden en que se barajan. */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const
