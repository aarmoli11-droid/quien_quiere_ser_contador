import { describe, expect, it } from 'vitest'

import seedQuestions from '@/data/questions.seed.json'
import type { Question } from '@/types'
import { MAX_CATEGORY_TEXT, MAX_OPTION_TEXT, MAX_QUESTION_TEXT } from './questionSchema'
import {
  createQuestionId,
  isQuestionBankShaped,
  parseQuestionBank,
  sanitizeQuestion,
  serializeQuestionBank,
} from './questionSchema'

/** Pregunta válida de partida, usada como base de las pruebas. */
const valida: Question = {
  id: 'q1',
  text: '¿Cuál es la correcta?',
  options: ['a', 'b', 'c'],
  correctIndex: 0,
  difficulty: 'facil',
  category: 'conceptos',
}

describe('sanitizeQuestion', () => {
  it('acepta una pregunta bien formada', () => {
    expect(sanitizeQuestion(valida)).toEqual(valida)
  })

  it('acepta el formato de 4 opciones', () => {
    const cuatro = { ...valida, options: ['a', 'b', 'c', 'd'] }

    expect(sanitizeQuestion(cuatro)).toEqual(cuatro)
  })

  it('acepta el formato de 2 opciones (mínimo permitido)', () => {
    const dos = { ...valida, options: ['a', 'b'], correctIndex: 1 }

    expect(sanitizeQuestion(dos)).toEqual(dos)
  })

  it('recorta espacios sobrantes del texto y de las opciones', () => {
    const sucio = { ...valida, text: '  ¿Cuál?  ', options: ['  a ', ' b', 'c  '], category: '  x  ' }
    const limpio = sanitizeQuestion(sucio)

    expect(limpio?.text).toBe('¿Cuál?')
    expect(limpio?.options).toEqual(['a', 'b', 'c'])
    expect(limpio?.category).toBe('x')
  })

  it('omite la categoría si viene vacía o en blanco', () => {
    expect(sanitizeQuestion({ ...valida, category: '   ' })?.category).toBeUndefined()
    expect(sanitizeQuestion({ ...valida, category: undefined })?.category).toBeUndefined()
  })

  it('rechaza entradas que no son un objeto', () => {
    expect(sanitizeQuestion(null)).toBeNull()
    expect(sanitizeQuestion(undefined)).toBeNull()
    expect(sanitizeQuestion('texto')).toBeNull()
    expect(sanitizeQuestion(42)).toBeNull()
    expect(sanitizeQuestion(true)).toBeNull()
    expect(sanitizeQuestion([])).toBeNull()
  })

  it('rechaza pregunta sin texto o con texto en blanco', () => {
    expect(sanitizeQuestion({ ...valida, text: '' })).toBeNull()
    expect(sanitizeQuestion({ ...valida, text: '   ' })).toBeNull()
    expect(sanitizeQuestion({ ...valida, text: 123 })).toBeNull()
    expect(sanitizeQuestion({ ...valida, text: null })).toBeNull()
  })

  it('rechaza options que no es un array', () => {
    expect(sanitizeQuestion({ ...valida, options: null })).toBeNull()
    expect(sanitizeQuestion({ ...valida, options: 'a,b,c' })).toBeNull()
    expect(sanitizeQuestion({ ...valida, options: undefined })).toBeNull()
  })

  it('rechaza preguntas con menos de 2 o más de 4 opciones', () => {
    expect(sanitizeQuestion({ ...valida, options: ['única'], correctIndex: 0 })).toBeNull()
    expect(
      sanitizeQuestion({ ...valida, options: ['a', 'b', 'c', 'd', 'e'], correctIndex: 0 }),
    ).toBeNull()
    expect(sanitizeQuestion({ ...valida, options: [] })).toBeNull()
  })

  it('rechaza correctIndex fuera de rango o de tipo incorrecto', () => {
    expect(sanitizeQuestion({ ...valida, correctIndex: 3 })).toBeNull()
    expect(sanitizeQuestion({ ...valida, correctIndex: -1 })).toBeNull()
    expect(sanitizeQuestion({ ...valida, correctIndex: 1.5 })).toBeNull()
    expect(sanitizeQuestion({ ...valida, correctIndex: '0' })).toBeNull()
    expect(sanitizeQuestion({ ...valida, correctIndex: Number.NaN })).toBeNull()
  })

  it('descarta las opciones no textuales y recalcula el índice correcto', () => {
    // Al filtrar `null` quedan 2 opciones válidas, pero la correcta era "b", que
    // estaba en la posición 2 del array original. Aceptarla sin más apuntaría a
    // "b" por casualidad y no por diseño: el índice se recalcula a la posición
    // que realmente ocupa la opción superviviente.
    const conHueco = { ...valida, options: ['a', null, 'b'], correctIndex: 2 }
    const resultado = sanitizeQuestion(conHueco)

    expect(resultado?.options).toEqual(['a', 'b'])
    expect(resultado?.correctIndex).toBe(1)
    expect(resultado?.options[resultado?.correctIndex ?? -1]).toBe('b')
  })

  it('rechaza si la opción descartada estaba antes de la correcta', () => {
    // El caso peligroso: la correcta era "a" (índice 0) y al filtrar un `null`
    // intermedio, "a" se desplazaría a la posición 0 pero el índice 1 acabaría
    // señalando "b". Sin recalcular, la pregunta se aceptaría con la respuesta
    // equivocada.
    const conHueco = { ...valida, options: [null, 'a', 'b'], correctIndex: 1 }
    const resultado = sanitizeQuestion(conHueco)

    expect(resultado?.options).toEqual(['a', 'b'])
    expect(resultado?.options[resultado?.correctIndex ?? -1]).toBe('a')
  })

  it('rechaza la pregunta si el índice apuntaba a una opción que se descartó', () => {
    // El índice 1 era la opción inválida: no hay forma de saber cuál era la
    // respuesta correcta, así que se descarta la pregunta entera.
    const conHueco = { ...valida, options: ['a', null, 'b'], correctIndex: 1 }

    expect(sanitizeQuestion(conHueco)).toBeNull()
  })

  it('asume dificultad facil si la dificultad es desconocida', () => {
    expect(sanitizeQuestion({ ...valida, difficulty: 'imposible' })?.difficulty).toBe('facil')
    expect(sanitizeQuestion({ ...valida, difficulty: undefined })?.difficulty).toBe('facil')
    expect(sanitizeQuestion({ ...valida, difficulty: 'dificil' })?.difficulty).toBe('dificil')
  })

  it('genera un id si falta o es inválido', () => {
    expect(sanitizeQuestion({ ...valida, id: '' })?.id).toMatch(/^q-/)
    expect(sanitizeQuestion({ ...valida, id: 123 })?.id).toMatch(/^q-/)
  })

  it('trunca los textos que superan el límite de longitud', () => {
    const largo = { ...valida, text: 'a'.repeat(1000), options: ['b'.repeat(500), 'x', 'y'] }
    const resultado = sanitizeQuestion(largo)

    expect(resultado?.text).toHaveLength(MAX_QUESTION_TEXT)
    expect(resultado?.options[0]).toHaveLength(MAX_OPTION_TEXT)
  })

  it('trunca la categoría larga', () => {
    const resultado = sanitizeQuestion({ ...valida, category: 'c'.repeat(200) })

    expect(resultado?.category).toHaveLength(MAX_CATEGORY_TEXT)
  })

  it('conserva el HTML del texto sin interpretarlo ni eliminarlo', () => {
    // El escapado lo aporta Vue al interpolar con `{{ }}`; si aquí se borraran
    // los caracteres especiales se corromperían preguntas válidas sin ganar
    // ninguna protección, porque el danger real está en el renderizado.
    const conHtml = { ...valida, text: '<img src=x onerror=alert(1)>' }

    expect(sanitizeQuestion(conHtml)?.text).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('createQuestionId', () => {
  it('genera ids distintos en llamadas seguidas', () => {
    // El id es la clave con la que se evita repetir preguntas en un desempate,
    // así que dos ids iguales permitirían sortear la misma pregunta dos veces.
    const ids = new Set(Array.from({ length: 50 }, () => createQuestionId()))

    expect(ids.size).toBe(50)
  })

  it('usa un formato reconocible', () => {
    expect(createQuestionId()).toMatch(/^q-[a-z0-9]+-[a-z0-9]+$/)
  })
})

describe('parseQuestionBank', () => {
  it('acepta un array plano', () => {
    expect(parseQuestionBank([valida])).toHaveLength(1)
  })

  it('acepta el objeto con la propiedad questions (formato de exportación)', () => {
    expect(parseQuestionBank({ version: 1, questions: [valida] })).toHaveLength(1)
  })

  it('devuelve vacío ante estructuras imposibles', () => {
    expect(parseQuestionBank(null)).toEqual([])
    expect(parseQuestionBank(undefined)).toEqual([])
    expect(parseQuestionBank('texto')).toEqual([])
    expect(parseQuestionBank({})).toEqual([])
    expect(parseQuestionBank({ questions: 'no-es-array' })).toEqual([])
    expect(parseQuestionBank(123)).toEqual([])
  })

  it('descarta solo las entradas inválidas y conserva las buenas', () => {
    // Importar 8 de 10 es mejor que no importar nada: el anfitrión puede
    // corregir las dos que faltan desde el panel de administración.
    const banco = [valida, { id: 'rota' }, { ...valida, id: 'q2' }]
    const resultado = parseQuestionBank(banco)

    expect(resultado).toHaveLength(2)
    expect(resultado.map((q) => q.id)).toEqual(['q1', 'q2'])
  })

  it('resuelve los ids repetidos con un sufijo', () => {
    const resultado = parseQuestionBank([valida, { ...valida }, { ...valida }])

    expect(resultado).toHaveLength(3)
    expect(new Set(resultado.map((q) => q.id)).size).toBe(3)
  })

  it('no muta los objetos que recibe', () => {
    const original = { ...valida, options: ['  a ', 'b', 'c'] }
    parseQuestionBank([original])

    expect(original.options).toEqual(['  a ', 'b', 'c'])
  })

  it('importa el banco semilla real completo', () => {
    const banco = parseQuestionBank(seedQuestions)

    expect(banco).toHaveLength(10)
    for (const q of banco) {
      expect(sanitizeQuestion(q)).not.toBeNull()
    }
  })
})

describe('isQuestionBankShaped', () => {
  it('reconoce un array plano y un objeto con questions', () => {
    expect(isQuestionBankShaped([])).toBe(true)
    expect(isQuestionBankShaped([valida])).toBe(true)
    expect(isQuestionBankShaped({ version: 1, questions: [] })).toBe(true)
  })

  it('rechaza formas que no son un banco', () => {
    // Es la comprobación que permite respetar un banco vacío a propósito sin
    // confundirlo con un archivo corrupto.
    expect(isQuestionBankShaped(null)).toBe(false)
    expect(isQuestionBankShaped(undefined)).toBe(false)
    expect(isQuestionBankShaped('texto')).toBe(false)
    expect(isQuestionBankShaped(42)).toBe(false)
    expect(isQuestionBankShaped({})).toBe(false)
    expect(isQuestionBankShaped({ questions: 'no-array' })).toBe(false)
    expect(isQuestionBankShaped({ preguntas: [] })).toBe(false)
  })
})

describe('serializeQuestionBank', () => {
  it('produce un JSON que se puede volver a importar', () => {
    // Ida y vuelta: exportar y reimportar debe devolver el mismo banco, que es
    // lo que garantiza que el archivo de respaldo sirve de algo.
    const exportado = serializeQuestionBank([valida])
    const reimportado = parseQuestionBank(JSON.parse(exportado))

    expect(reimportado).toEqual([valida])
  })

  it('conserva las 10 preguntas semilla en la ida y vuelta', () => {
    const banco = parseQuestionBank(seedQuestions)
    const reimportado = parseQuestionBank(JSON.parse(serializeQuestionBank(banco)))

    expect(reimportado).toHaveLength(10)
    expect(reimportado.map((q) => q.correctIndex)).toEqual(banco.map((q) => q.correctIndex))
  })

  it('indica la versión del formato', () => {
    expect(JSON.parse(serializeQuestionBank([]))).toEqual({ version: 1, questions: [] })
  })
})
