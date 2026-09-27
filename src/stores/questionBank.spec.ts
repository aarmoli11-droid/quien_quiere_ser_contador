import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import seedQuestions from '@/data/questions.seed.json'
import { parseQuestionBank } from '@/lib/questionSchema'
import type { Question } from '@/types'
import { useQuestionBankStore } from './questionBank'

const STORAGE_KEY = 'qqsc.banco.v1'
const SEED = parseQuestionBank(seedQuestions)

/** Instala un Pinia limpio y devuelve el store ya cargado. */
function nuevoStore() {
  setActivePinia(createPinia())
  const store = useQuestionBankStore()
  store.load()
  return store
}

const valida: Question = {
  id: 'q1',
  text: '¿Cuál es la correcta?',
  options: ['a', 'b', 'c'],
  correctIndex: 0,
  difficulty: 'facil',
  category: 'conceptos',
}

describe('carga inicial', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('carga la semilla cuando no hay nada guardado', () => {
    const store = nuevoStore()

    expect(store.count).toBe(10)
    expect(store.questions.map((q) => q.id)).toEqual(SEED.map((q) => q.id))
  })

  it('persiste la semilla para no regenerarla en cada visita', () => {
    nuevoStore()

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('carga lo guardado en lugar de la semilla', () => {
    const custom = [{ ...valida, id: 'custom' }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))

    const store = nuevoStore()

    expect(store.count).toBe(1)
    expect(store.questions[0]?.id).toBe('custom')
  })

  it('cae a la semilla si lo guardado es JSON corrupto', () => {
    localStorage.setItem(STORAGE_KEY, 'no es json {{{')

    expect(nuevoStore().count).toBe(10)
  })

  it('cae a la semilla si lo guardado no tiene forma de banco', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preguntas: 'no-es-un-array' }))

    expect(nuevoStore().count).toBe(10)
  })

  it('respeta un banco vacío guardado a propósito', () => {
    // El anfitrión pudo borrar todas las preguntas: es válido, no corrupto.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, questions: [] }))

    expect(nuevoStore().count).toBe(0)
  })

  it('funciona aunque localStorage no permita escribir', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    })

    setActivePinia(createPinia())
    const store = useQuestionBankStore()

    expect(() => store.load()).not.toThrow()
    expect(store.count).toBe(10)
    expect(store.persistWarning).not.toBeNull()

    vi.unstubAllGlobals()
  })
})

describe('addQuestion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('añade una pregunta válida y la persiste', () => {
    const store = nuevoStore()
    const antes = store.count

    const guardada = store.addQuestion({ ...valida, id: 'ignorada' })

    expect(store.count).toBe(antes + 1)
    // El id se genera en el store, no se acepta el que venga del formulario.
    expect(guardada?.id).not.toBe('ignorada')
    expect(guardada?.id).toMatch(/^q-/)
  })

  it('genera ids únicos para preguntas idénticas', () => {
    const store = nuevoStore()
    const a = store.addQuestion(valida)
    const b = store.addQuestion(valida)

    expect(a?.id).not.toBe(b?.id)
  })

  it('rechaza datos inválidos sin modificar el banco', () => {
    const store = nuevoStore()
    const antes = store.count

    expect(store.addQuestion({ ...valida, text: '' })).toBeNull()
    expect(store.addQuestion({ ...valida, correctIndex: 99 })).toBeNull()
    expect(store.addQuestion(null)).toBeNull()
    expect(store.count).toBe(antes)
  })

  it('acepta preguntas de 3 y de 4 opciones', () => {
    const store = nuevoStore()

    expect(store.addQuestion({ ...valida, options: ['a', 'b', 'c'] })).not.toBeNull()
    expect(store.addQuestion({ ...valida, options: ['a', 'b', 'c', 'd'] })).not.toBeNull()
  })
})

describe('updateQuestion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('actualiza el texto conservando el id original', () => {
    const store = nuevoStore()
    const objetivo = store.questions[0]
    if (objetivo === undefined) throw new Error('banco vacío')

    const actualizada = store.updateQuestion(objetivo.id, {
      ...objetivo,
      text: 'texto nuevo',
    })

    expect(actualizada?.text).toBe('texto nuevo')
    expect(actualizada?.id).toBe(objetivo.id)
    expect(store.questions[0]?.text).toBe('texto nuevo')
  })

  it('cambia la respuesta correcta sin tocar el resto', () => {
    const store = nuevoStore()
    const objetivo = store.questions[0]
    if (objetivo === undefined) throw new Error('banco vacío')

    store.updateQuestion(objetivo.id, { ...objetivo, correctIndex: 2 })

    expect(store.questions[0]?.correctIndex).toBe(2)
    expect(store.questions[0]?.options).toEqual(objetivo.options)
  })

  it('rechaza un id inexistente', () => {
    const store = nuevoStore()

    expect(store.updateQuestion('no-existe', valida)).toBeNull()
  })

  it('rechaza datos inválidos sin perder la versión anterior', () => {
    // Es el caso importante: si el formulario guarda algo corrupto, el trabajo
    // previo no debe desaparecer.
    const store = nuevoStore()
    const objetivo = store.questions[0]
    if (objetivo === undefined) throw new Error('banco vacio')
    const textoOriginal = objetivo.text

    expect(store.updateQuestion(objetivo.id, { ...objetivo, options: ['solo-una'] })).toBeNull()
    expect(store.questions[0]?.text).toBe(textoOriginal)
    expect(store.questions[0]?.options).toEqual(objetivo.options)
  })
})

describe('deleteQuestion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('elimina la pregunta indicada', () => {
    const store = nuevoStore()
    const objetivo = store.questions[0]
    if (objetivo === undefined) throw new Error('banco vacío')
    const antes = store.count

    expect(store.deleteQuestion(objetivo.id)).toBe(true)
    expect(store.count).toBe(antes - 1)
    expect(store.questions.some((q) => q.id === objetivo.id)).toBe(false)
  })

  it('devuelve false si la pregunta no existe', () => {
    const store = nuevoStore()

    expect(store.deleteQuestion('no-existe')).toBe(false)
  })

  it('puede vaciar el banco por completo', () => {
    const store = nuevoStore()

    for (const q of [...store.questions]) store.deleteQuestion(q.id)

    expect(store.count).toBe(0)
  })
})

describe('deleteCategory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('elimina todas las preguntas de la categoría', () => {
    const store = nuevoStore()
    // `calculo-basico` aparece en q1 y q9 de la semilla.
    const affected = store.questions.filter((q) => q.category === 'calculo-basico')
    expect(affected.length).toBeGreaterThan(1)

    expect(store.deleteCategory('calculo-basico')).toBe(true)
    expect(store.questions.some((q) => q.category === 'calculo-basico')).toBe(false)
  })

  it('devuelve false si la categoría no existe', () => {
    const store = nuevoStore()

    expect(store.deleteCategory('categoria-inexistente')).toBe(false)
  })
})

describe('importBank', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reemplaza el banco e informa de aceptadas y descartadas', () => {
    const store = nuevoStore()
    const resultado = store.importBank([valida, { id: 'rota' }, valida, valida])

    expect(resultado).toEqual({ imported: 3, rejected: 1 })
    expect(store.count).toBe(3)
  })

  it('acepta el formato de exportación con version', () => {
    const store = nuevoStore()
    const resultado = store.importBank({ version: 1, questions: [valida] })

    expect(resultado.imported).toBe(1)
  })

  it('acepta el texto del archivo, tal como lo entrega un input de fichero', () => {
    // El `<input type="file">` entrega el contenido como cadena. Si el store no
    // lo interpreta, la importación se queda siempre en cero preguntas.
    const store = nuevoStore()
    const resultado = store.importBank(JSON.stringify({ version: 1, questions: [valida, valida] }))

    expect(resultado).toEqual({ imported: 2, rejected: 0 })
    expect(store.count).toBe(2)
  })

  it('deja el banco vacío ante un archivo totalmente inválido', () => {
    // Es preferible un banco vacío y visible que conservar la semilla y dar la
    // impresión de que la importación funcionó.
    const store = nuevoStore()
    const resultado = store.importBank('esto no es un banco')

    expect(resultado.imported).toBe(0)
    expect(resultado.rejected).toBe(0)
    expect(resultado.error).toBe('El archivo no es un JSON válido.')
    expect(store.count).toBe(0)
  })

  it('avisa cuando el JSON es válido pero no es un banco de preguntas', () => {
    const store = nuevoStore()
    const resultado = store.importBank(JSON.stringify({ hola: 'que tal' }))

    expect(resultado.error).toBe('El archivo no contiene un banco de preguntas.')
    expect(store.count).toBe(0)
  })

  it('informa de 0 descartados si el archivo no es un array de preguntas', () => {
    const store = nuevoStore()

    expect(store.importBank({}).rejected).toBe(0)
  })
})

describe('exportBank y resetToSeed', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('exporta un JSON reimportable con los mismos datos', () => {
    const store = nuevoStore()
    const exportado = store.exportBank()

    store.deleteQuestion(store.questions[0]?.id ?? '')
    const antes = store.count
    store.importBank(JSON.parse(exportado))

    expect(store.count).toBe(antes + 1)
  })

  it('restaura la semilla y borra el almacenamiento', () => {
    const store = nuevoStore()
    store.deleteQuestion(store.questions[0]?.id ?? '')
    expect(store.count).toBe(9)

    store.resetToSeed()

    expect(store.count).toBe(10)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(store.persistWarning).toBeNull()
  })
})

describe('getters', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('filtra por dificultad', () => {
    const store = nuevoStore()
    store.importBank([
      { ...valida, id: 'f1', difficulty: 'facil' },
      { ...valida, id: 'd1', difficulty: 'dificil' },
    ])

    expect(store.byDifficulty('facil')).toHaveLength(1)
    expect(store.byDifficulty('dificil')).toHaveLength(1)
    expect(store.byDifficulty('facil')[0]?.id).toBe('f1')
  })

  it('lista las categorías sin duplicados y ordenadas', () => {
    const store = nuevoStore()

    expect(store.categories).toContain('conceptos')
    expect(store.categories).toContain('calculo-basico')
    expect(new Set(store.categories).size).toBe(store.categories.length)
  })

  it('tolera un banco vacío', () => {
    const store = nuevoStore()
    store.importBank([])

    expect(store.count).toBe(0)
    expect(store.categories).toEqual([])
    expect(store.byDifficulty('facil')).toEqual([])
  })
})
