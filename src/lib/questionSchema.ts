import type { Difficulty, Question } from '@/types'
import { MAX_OPTIONS, MIN_OPTIONS } from '@/types'

/**
 * Validación y normalización de preguntas.
 *
 * Vive fuera del store para poder probarse sin montar Pinia y para que el
 * importador de JSON y el formulario de edición apliquen exactamente las
 * mismas reglas: así no puede haber dos caminos que acepten datos distintos.
 *
 * Nota sobre seguridad: estas funciones **no**intentan "limpiar" el HTML de los
 * textos. No es su trabajo. La protección frente a XSS la da el renderizado: los
 * componentes interpolan con `{{ }}`, que Vue escapa, y el proyecto no usa
 * `v-html` con contenido editable. Eliminar aquí los caracteres `<` o `>`
 * corrompería preguntas legítimas de contabilidad (comparaciones, etiquetas) sin
 * aportar ninguna protección real.
 */

/** Límites de longitud para que una pregunta no pueda desbordar la pantalla. */
export const MAX_QUESTION_TEXT = 300
export const MAX_OPTION_TEXT = 120
export const MAX_CATEGORY_TEXT = 40

/** Devuelve `true` si el valor es una dificultad reconocida. */
function isDifficulty(value: unknown): value is Difficulty {
  return value === 'facil' || value === 'dificil'
}

/** Convierte cualquier valor a string recortado, o `null` si no es texto útil. */
function toTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  // Recortar evita que una pregunta enorme rompa el diseño de la arena.
  return trimmed.slice(0, maxLength)
}

/**
 * Valida y normaliza un objeto arbitrario para convertirlo en `Question`.
 *
 * Devuelve `null` si no es una pregunta jugable, en lugar de lanzar o de
 * devolver una pregunta medio construida. Es la frontera de confianza: acepta
 * tanto datos de `localStorage` como un JSON subido por el usuario, y ambos
 * pueden estar corruptos o manipulados.
 */
export function sanitizeQuestion(raw: unknown): Question | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const candidato = raw as Record<string, unknown>

  const text = toTrimmedString(candidato['text'], MAX_QUESTION_TEXT)
  if (text === null) return null

  const rawOptions = candidato['options']
  if (!Array.isArray(rawOptions)) return null

  // Se descartan las opciones que no sean texto (null, 3, {}) en lugar de
  // convertirla en "undefined", que se mostraría en pantalla tal cual.
  const options = rawOptions
    .map((option) => toTrimmedString(option, MAX_OPTION_TEXT))
    .filter((option): option is string => option !== null)

  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return null

  const correctIndex = candidato['correctIndex']
  // Solo se acepta un entero dentro del rango real de opciones ya filtradas.
  // Si el índice apuntaba a una opción descartada, se rechaza la pregunta
  // entera en vez de señalarla mal.
  if (
    typeof correctIndex !== 'number' ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= options.length
  ) {
    return null
  }

  const difficulty = candidato['difficulty']
  const category = toTrimmedString(candidato['category'], MAX_CATEGORY_TEXT)

  return {
    // El id se acepta si es texto no vacío; si no, se genera uno más abajo.
    id: toTrimmedString(candidato['id'], 60) ?? createQuestionId(),
    text,
    options,
    correctIndex,
    // Una dificultad desconocida se asume "facil" en lugar de rechazar la
    // pregunta: el anfitrión siempre tiene un modo válido que aplicar.
    difficulty: isDifficulty(difficulty) ? difficulty : 'facil',
    ...(category === null ? {} : { category }),
  }
}

/**
 * Genera un identificador único para una pregunta nueva.
 *
 * Se usa una marca de tiempo en lugar de un contador porque dos preguntas
 * creadas dentro del mismo milisegundo (o tras recargar la página) no deben
 * compartir id, y el id es la clave con la que se evita repetir preguntas en
 * los desempates.
 */
export function createQuestionId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Interpreta un banco de preguntas completo.
 *
 * Acepta tanto un array plano como un objeto `{ "questions": [...] }`, que es la
 * forma que produce la exportación. Descarta las entradas inválidas en lugar de
 * fallar todo el import: es preferible cargar 8 preguntas de 10 que no cargar
 * ninguna. Los ids repetidos se resuelven con un sufijo, porque dos preguntas
 * con el mismo id harían que un desempate las tratara como la misma.
 */
export function parseQuestionBank(raw: unknown): Question[] {
  const lista =
    Array.isArray(raw)
      ? raw
      : raw !== null && typeof raw === 'object'
        ? (raw as Record<string, unknown>)['questions']
        : undefined

  if (!Array.isArray(lista)) return []

  const vistos = new Set<string>()
  const resultado: Question[] = []

  for (const item of lista) {
    const pregunta = sanitizeQuestion(item)
    if (pregunta === null) continue

    let id = pregunta.id
    if (vistos.has(id)) {
      let sufijo = 2
      while (vistos.has(`${id}-${sufijo}`)) sufijo += 1
      id = `${id}-${sufijo}`
    }
    vistos.add(id)
    resultado.push({ ...pregunta, id })
  }

  return resultado
}

/**
 * Construye el objeto que se descarga al exportar el banco.
 *
 * Se incluye un número de versión para que una exportación antigua siga
 * siendo legible si el formato cambia más adelante.
 */
export function serializeQuestionBank(questions: readonly Question[]): string {
  return JSON.stringify({ version: 1, questions }, null, 2)
}
