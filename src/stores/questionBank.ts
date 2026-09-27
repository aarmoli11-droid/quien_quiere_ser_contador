import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import seedQuestions from '@/data/questions.seed.json'
import {
  createQuestionId,
  isQuestionBankShaped,
  parseQuestionBank,
  sanitizeQuestion,
  serializeQuestionBank,
} from '@/lib/questionSchema'
import { isStorageAvailable, readJson, removeKey, writeJson } from '@/lib/storage'
import type { Difficulty, Question } from '@/types'

/**
 * Clave de almacenamiento.
 *
 * Lleva un sufijo de versión para poder cambiar el formato guardado más
 * adelante sin tener que migrar datos antiguos: si el formato cambia, se sube
 * la versión y los datos viejos se descartan solos.
 */
const STORAGE_KEY = 'qqsc.banco.v1'

/** Banco por defecto que se carga la primera vez que se abre el juego. */
const SEED: Question[] = parseQuestionBank(seedQuestions)

/**
 * Resultado de una operación de escritura. Devolver un objeto con `ok` en vez
 * de lanzar permite que la interfaz avise al usuario sin try/catch en cada
 * componente, y hace que los tests puedan comprobar el fallo directamente.
 */
export interface SaveResult {
  ok: boolean
  /** Mensaje listo para mostrar, o `null` si todo fue bien. */
  message: string | null
}

/**
 * Banco de preguntas editable.
 *
 * Es la única fuente de verdad sobre qué preguntas existen. El juego consume
 * `questions` al montar una partida y el panel de administración la modifica;
 * ambos pasan por las mismas acciones, de modo que todo cambio pasa por
 * `sanitizeQuestion` y queda validado antes de guardarse.
 */
export const useQuestionBankStore = defineStore('questionBank', () => {
  const questions = ref<Question[]>([])
  /** `true` cuando los cambios no se pueden guardar (cuota llena, modo privado). */
  const persistWarning = ref<string | null>(null)

  /**
   * Carga el banco desde el almacenamiento y, si no hay nada o está corrupto,
   * deja la semilla.
   *
   * Se llama al crear el store, así que la aplicación siempre empieza con un
   * banco utilizable aunque el almacenamiento esté vacío, dañado o inaccesible.
   */
  function load(): void {
    const guardada = readJson<unknown>(STORAGE_KEY, null)

    // Sin nada guardado, o con un valor cuya forma no es un banco (corrupto o
    // de otra aplicación), se arranca desde la semilla.
    if (guardada === null || !isQuestionBankShaped(guardada)) {
      questions.value = [...SEED]
      if (guardada === null) persist()
      return
    }

    // La forma es correcta, así que el contenido se respeta incluso si está
    // vacío: que el anfitrión haya borrado todas las preguntas a propósito es
    // una decisión suya y no un fallo que haya que revertir.
    questions.value = parseQuestionBank(guardada)
  }

  /** Guarda el banco actual. Nunca lanza: informa del fallo en `persistWarning`. */
  function persist(): SaveResult {
    const ok = writeJson(STORAGE_KEY, questions.value)
    persistWarning.value = ok
      ? null
      : 'No se pudieron guardar los cambios en este navegador. El juego sigue funcionando, pero los cambios se perderán al cerrar la pestaña.'
    return { ok, message: persistWarning.value }
  }

  /** Añade una pregunta y devuelve la guardada, o `null` si no era válida. */
  function addQuestion(input: unknown): Question | null {
    const pregunta = sanitizeQuestion(input)
    if (pregunta === null) return null

    // El id se genera aquí para que dos preguntas idénticas tengan distinto id
    // y el desempate no las confunda como si fueran la misma.
    questions.value = [...questions.value, { ...pregunta, id: createQuestionId() }]
    persist()
    return questions.value[questions.value.length - 1] ?? null
  }

  /**
   * Actualiza la pregunta con ese id.
   *
   * Devuelve `null` si no existe la pregunta o si los datos nuevos no son
   * válidos; en ese caso el banco queda intacto, para que un guardado inválido
   * desde el formulario no borre el trabajo que ya había.
   */
  function updateQuestion(id: string, input: unknown): Question | null {
    const pregunta = sanitizeQuestion(input)
    if (pregunta === null) return null

    const indice = questions.value.findIndex((q) => q.id === id)
    if (indice === -1) return null

    const actualizada: Question = { ...pregunta, id }
    questions.value = questions.value.map((q, i) => (i === indice ? actualizada : q))
    persist()
    return actualizada
  }

  /** Elimina la pregunta con ese id. `true` si se borró algo. */
  function deleteQuestion(id: string): boolean {
    const antes = questions.value.length
    questions.value = questions.value.filter((q) => q.id !== id)
    if (questions.value.length === antes) return false

    persist()
    return true
  }

  /** Elimina todas las preguntas de una categoría. `true` si borró alguna. */
  function deleteCategory(category: string): boolean {
    const antes = questions.value.length
    questions.value = questions.value.filter((q) => q.category !== category)
    if (questions.value.length === antes) return false

    persist()
    return true
  }

  /**
   * Reemplaza todo el banco (importación de un JSON).
   *
   * Acepta el **texto** del archivo, un array o el objeto `{ questions: [...] }`.
   * El texto es el caso normal: un `<input type="file">` entrega el contenido
   * como cadena, y no parsearlo aquí devolvía siempre un banco vacío sin llegar
   * a explicar por qué.
   *
   * Devuelve cuántas preguntas se aceptaron y cuántas se descartaron, para que
   * la interfaz pueda avisar con precisión en vez de decir "importado". Si el
   * archivo no se puede interpretar, `error` explica el motivo: sin él, un
   * JSON corrupto y un banco vacío válido se confundirían en el mismo aviso de
   * "0 importadas".
   */
  function importBank(raw: unknown): { imported: number; rejected: number; error?: string } {
    let contenido: unknown = raw

    if (typeof raw === 'string') {
      try {
        contenido = JSON.parse(raw)
      } catch {
        // Un archivo corrupto o que no es JSON. Se vacía el banco para no dejar
        // a medias una importación a medias, y se informa del motivo.
        questions.value = []
        persist()
        return { imported: 0, rejected: 0, error: 'El archivo no es un JSON válido.' }
      }
    }

    const total = Array.isArray(contenido)
      ? contenido.length
      : contenido !== null && typeof contenido === 'object'
        ? ((contenido as Record<string, unknown>)['questions'] as unknown[] | undefined)?.length ?? 0
        : 0

    const parseada = parseQuestionBank(contenido)
    questions.value = parseada
    persist()

    if (!isQuestionBankShaped(contenido)) {
      return {
        imported: parseada.length,
        rejected: Math.max(0, total - parseada.length),
        error: 'El archivo no contiene un banco de preguntas.',
      }
    }

    return { imported: parseada.length, rejected: Math.max(0, total - parseada.length) }
  }

  /** Genera el texto del archivo de respaldo. */
  function exportBank(): string {
    return serializeQuestionBank(questions.value)
  }

  /** Restaura el banco semilla y borra lo guardado. */
  function resetToSeed(): void {
    questions.value = [...SEED]
    removeKey(STORAGE_KEY)
    persistWarning.value = null
  }

  /** Preguntas jugables, que son todas: el banco solo guarda preguntas válidas. */
  const playable = computed<Question[]>(() => questions.value)

  /** Filtra por dificultad, que es el criterio que usa la partida. */
  const byDifficulty = computed(() => (difficulty: Difficulty) =>
    questions.value.filter((q) => q.difficulty === difficulty),
  )

  /** Categorías presentes en el banco, ordenadas alfabéticamente. */
  const categories = computed<string[]>(() =>
    [...new Set(questions.value.map((q) => q.category).filter((c): c is string => typeof c === 'string'))]
      .sort((a, b) => a.localeCompare(b, 'es')),
  )

  /** Número total de preguntas del banco. */
  const count = computed(() => questions.value.length)

  /** `true` si los cambios se pueden guardar en este navegador. */
  const canPersist = computed(() => isStorageAvailable())

  return {
    questions,
    playable,
    byDifficulty,
    categories,
    count,
    canPersist,
    persistWarning,
    load,
    persist,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    deleteCategory,
    importBank,
    exportBank,
    resetToSeed,
  }
})
