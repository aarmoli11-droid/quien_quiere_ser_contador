import type { Question, ShuffledQuestion } from '@/types'
import { MAX_OPTIONS, OPTION_LETTERS } from '@/types'

/**
 * Generador de números aleatorios inyectable. Por defecto se usa `Math.random`
 * (suficiente para un juego de feria), pero los tests inyectan un generador
 * determinista para poder comprobar casos concretos sin depender del azar.
 */
export type Rng = () => number

/**
 * Baraja una copia de la lista con el algoritmo de Fisher-Yates.
 *
 * Se usa Fisher-Yates (y no `sort(() => Math.random() - 0.5)`) porque este
 * último tiene un sesgo conocido que produce mezclas no uniformes: en un
 * concurso una distribución sesgada haría que algunas opciones aparecieran más
 * que otras y podría filtrar información sobre cuál es la correcta.
 *
 * Recibe `readonly` y devuelve una copia nueva: nunca muta la entrada, de modo
 * que la pregunta original del banco queda intacta para la siguiente partida.
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    // `Math.floor` sobre un entero de [0, i] reparte la probabilidad de forma
    // uniforme entre los `i + 1` índices disponibles.
    const j = Math.floor(rng() * (i + 1))
    const a = result[i]
    const b = result[j]
    // `i` y `j` siempre están dentro del array, pero la comprobación evita que
    // un `rng` defectuoso en los tests produzca índices `undefined` en silencio.
    if (a === undefined || b === undefined) continue
    result[i] = b
    result[j] = a
  }
  return result
}

/**
 * Prepara una pregunta para mostrarla en la arena.
 *
 * Esta función es la salvaguarda de integridad del juego: en el banco real la
 * respuesta correcta siempre es la opción A, así que sin mezclar las opciones los grupos
 * detectarían el patrón y el juego quedaría sin sentido. Por eso la mezcla no
 * mueve "la letra A" ni reescribe el texto: mueve *la respuesta correcta
 * junto con su texto* y luego deduce en qué posición quedó. De ese modo es
 * imposible que la respuesta señalada se desplace de su propio texto.
 *
 * La mezcla usa `Math.random` en cada llamada, así que la misma pregunta
 * aparece en un orden distinto en cada partida y en cada ronda de desempate.
 *
 * Casos límite que resuelve:
 * - Sin opciones: devuelve la pregunta con `correctIndex` en -1 (nadie puntúa).
 * - `correctIndex` fuera de rango (dato corrupto): se degrada a -1 en lugar de
 *   apuntar a una posición inexistente y marcar la opción equivocada.
 */
export function shuffleQuestion(q: Question, rng: Rng = Math.random): ShuffledQuestion {
  const options = q.options ?? []
  // El índice autor es válido solo si cae dentro del rango real de opciones.
  const authorIndexIsValid =
    Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < options.length

  // Cada opción viaja junto a un booleano que dice si es la correcta. Mezclar
  // el texto por separado del índice es justamente el error que hay que evitar.
  const pairs = options.map((text, index) => ({
    text,
    isCorrect: authorIndexIsValid && index === q.correctIndex,
  }))

  const shuffled = shuffle(pairs, rng)
  // La nueva posición correcta se deduce del booleano que acabó de viajar con
  // cada texto, no del índice que tenía antes de mezclar.
  const correctIndex = shuffled.findIndex((pair) => pair.isCorrect)

  return {
    id: q.id,
    text: q.text,
    options: shuffled.map((pair) => pair.text),
    // `findIndex` devuelve -1 cuando no hay ninguna opción correcta; se
    // conserva ese valor a propósito y el store lo trata como "nadie suma".
    correctIndex,
    difficulty: q.difficulty,
    ...(q.category === undefined ? {} : { category: q.category }),
    letters: shuffled.map((_, index) => OPTION_LETTERS[index] ?? String(index + 1)),
  }
}

/**
 * Elige `count` preguntas al azar del banco, sin repetir.
 *
 * Devuelve menos de `count` si el banco no tiene suficientes, para que el
 * store pueda avisar al anfitrión en lugar de crear una partida con huecos.
 */
export function pickRandomQuestions(
  bank: readonly Question[],
  count: number,
  rng: Rng = Math.random,
): Question[] {
  const wanted = Math.max(0, Math.floor(count))
  return shuffle(bank, rng).slice(0, Math.min(wanted, bank.length))
}

/**
 * Quita del banco las preguntas ya usadas en la partida, para que un desempate
 * no vuelva a sortear una pregunta que los grupos ya respondieron.
 */
export function removeUsedQuestions(
  bank: readonly Question[],
  usedIds: readonly string[],
): Question[] {
  // Un `Set` evita el coste cuadrático de `includes` sobre un banco grande.
  const used = new Set(usedIds)
  return bank.filter((q) => !used.has(q.id))
}

/**
 * Valida que una pregunta sea jugable: al menos `MIN_OPTIONS` opciones y un
 * `correctIndex` dentro de rango. La usa el banco antes de ofrecerla en partida
 * y el panel de administración al guardar.
 */
export function isPlayableQuestion(q: Question): boolean {
  if (!q || typeof q.text !== 'string' || q.text.trim() === '') return false
  if (!Array.isArray(q.options) || q.options.length < 2) return false
  if (q.options.length > MAX_OPTIONS) return false
  if (!Number.isInteger(q.correctIndex)) return false
  return q.correctIndex >= 0 && q.correctIndex < q.options.length
}
