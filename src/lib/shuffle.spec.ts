import { describe, expect, it } from 'vitest'

// Banco semilla real: los tests de integridad deben correr contra los mismos
// datos que la aplicación, no contra una copia que se pueda desincronizar.
import seedQuestions from '@/data/questions.seed.json'
import type { Question } from '@/types'
import {
  isPlayableQuestion,
  pickRandomQuestions,
  removeUsedQuestions,
  shuffle,
  shuffleQuestion,
} from './shuffle'

/**
 * Generador determinista: cada llamada devuelve el siguiente valor de la
 * lista. Permite comprobar un orden concreto de mezcla sin depender del azar,
 * que es lo que hace falta para demostrar que la respuesta correcta no se
 * descoloca de su texto.
 */
function sequenceRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

/** Pregunta de ejemplo de 3 opciones, con la correcta siempre en A como en el banco real. */
function questionWith(correctIndex: number, options = ['A', 'B', 'C']): Question {
  return {
    id: 'q-test',
    text: '¿Cuál es la correcta?',
    options,
    correctIndex,
    difficulty: 'facil',
    category: 'pruebas',
  }
}

describe('shuffle', () => {
  it('devuelve una copia nueva y no muta la lista original', () => {
    const original = [1, 2, 3, 4]
    const copia = shuffle(original)

    // La copia es un objeto distinto pero con exactamente los mismos
    // elementos: la baraja reordena, nunca pierde ni inventa valores.
    expect(copia).not.toBe(original)
    expect([...copia].sort()).toEqual([1, 2, 3, 4])
    // El original queda intacto, que es lo que permite reutilizar la pregunta
    // del banco en la siguiente partida.
    expect(original).toEqual([1, 2, 3, 4])
  })

  it('conserva todos los elementos aunque se repitan valores', () => {
    const original = ['x', 'x', 'y']
    const copia = shuffle(original)

    expect(copia).toHaveLength(3)
    expect([...copia].sort()).toEqual(['x', 'x', 'y'])
  })

  it('no pierde elementos con listas de 0 y 1 elementos', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['única'])).toEqual(['única'])
  })

  it('tolera un rng que devuelve 1 (borde superior del rango)', () => {
    // `Math.floor(1 * (i + 1))` daría `i + 1`, fuera del array. El guard de
    // índices indefinidos evita que se cuele un `undefined` en el resultado.
    const resultado = shuffle(['a', 'b', 'c'], () => 1)

    expect(resultado).toHaveLength(3)
    expect(resultado).not.toContain(undefined)
  })
})

describe('shuffleQuestion: la respuesta correcta nunca se separa de su texto', () => {
  it('mantiene la correcta apuntando a su propio texto tras mezclar', () => {
    // Se prueban los 3 órdenes posibles a propósito, no un orden al azar: el
    // fallo que hay que descartar es "la correcta queda en A tras mezclar".
    const ordenes: number[][] = [
      [0, 0.5, 0.99], // identidad
      [0.99, 0.5, 0], // rotación completa
      [0.5, 0.99, 0],
    ]

    for (const rngValues of ordenes) {
      const q = questionWith(0, ['correcta', 'distractora-1', 'distractora-2'])
      const r = shuffleQuestion(q, sequenceRng(rngValues))

      expect(r.options[r.correctIndex]).toBe('correcta')
    }
  })

  it('conserva la correcta si en el banco no está en A', () => {
    for (const correcta of [0, 1, 2]) {
      const options = ['A', 'B', 'C']
      const q = questionWith(correcta, options)
      const r = shuffleQuestion(q, sequenceRng([0.8, 0.1, 0.6, 0.3]))

      expect(r.options[r.correctIndex]).toBe(options[correcta])
    }
  })

  it('no pierde ni duplica opciones al mezclar', () => {
    const q = questionWith(0, ['a', 'b', 'c'])
    const r = shuffleQuestion(q)

    expect(r.options).toHaveLength(3)
    expect([...r.options].sort()).toEqual(['a', 'b', 'c'])
  })

  it('produce un orden distinto en llamadas sucesivas (no es fijo por semilla)', () => {
    const q = questionWith(0, ['a', 'b', 'c', 'd'])

    // Con 4 opciones hay 24 órdenes posibles; 200 intentos deben producir al
    // menos dos distintos. Si el shuffle fuese fijo, esto fallaría.
    const vistos = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      vistos.add(shuffleQuestion(q).options.join('|'))
    }

    expect(vistos.size).toBeGreaterThan(1)
  })

  it('nunca deja la correcta en la posición del autor si el banco la pone en A', () => {
    // Verificación estadística del requisito de integridad: con la respuesta
    // correcta siempre en A, si el shuffle no funcionara, el 100% de las
    // partidas la mostraría en A. Se exige que se reparta.
    const q = questionWith(0, ['a', 'b', 'c'])
    const posiciones = new Set<number>()

    for (let i = 0; i < 300; i += 1) {
      posiciones.add(shuffleQuestion(q).correctIndex)
    }

    expect(posiciones.size).toBe(3)
  })

  it('genera las letras A, B, C… según el orden ya mezclado', () => {
    const r = shuffleQuestion(questionWith(0, ['a', 'b', 'c']))

    expect(r.letters).toEqual(['A', 'B', 'C'])
    expect(r.letters).toHaveLength(r.options.length)
  })

  it('soporta 4 opciones sin romperse', () => {
    const r = shuffleQuestion(questionWith(0, ['a', 'b', 'c', 'd']))

    expect(r.options).toHaveLength(4)
    expect(r.letters).toEqual(['A', 'B', 'C', 'D'])
    expect(r.options[r.correctIndex]).toBe('a')
  })
})

describe('shuffleQuestion: datos corruptos', () => {
  it('devuelve correctIndex -1 si el índice autor está fuera de rango', () => {
    // Si se aceptara, el juego marcaría como correcta una opción que no existe.
    expect(shuffleQuestion(questionWith(9)).correctIndex).toBe(-1)
    expect(shuffleQuestion(questionWith(-3)).correctIndex).toBe(-1)
  })

  it('devuelve correctIndex -1 si el índice no es entero', () => {
    expect(shuffleQuestion(questionWith(1.5)).correctIndex).toBe(-1)
    expect(shuffleQuestion(questionWith(Number.NaN)).correctIndex).toBe(-1)
  })

  it('no rompe con una pregunta sin opciones', () => {
    const r = shuffleQuestion({ ...questionWith(0), options: [] })

    expect(r.options).toEqual([])
    expect(r.correctIndex).toBe(-1)
  })

  it('no rompe si el campo options no es un array', () => {
    const roto = { ...questionWith(0), options: undefined as unknown as string[] }

    expect(() => shuffleQuestion(roto)).not.toThrow()
    expect(shuffleQuestion(roto).correctIndex).toBe(-1)
  })

  it('tolera textos con HTML sin interpretarlos', () => {
    // El texto de la pregunta y de las opciones se interpola con `{{ }}` en los
    // componentes, que escapa el HTML. Esta prueba fija esa expectativa: el
    // shuffle solo reordena strings, no interpreta ni sanitiza su contenido.
    const q = questionWith(0, ['<img src=x onerror=alert(1)>', 'b', 'c'])
    const r = shuffleQuestion(q)

    expect(r.options).toContain('<img src=x onerror=alert(1)>')
    expect(r.options[r.correctIndex]).toBe('<img src=x onerror=alert(1)>')
  })

  it('conserva la categoría solo si existe', () => {
    const conCategoria = shuffleQuestion(questionWith(0))
    const sinCategoria = shuffleQuestion({ ...questionWith(0), category: undefined })

    expect(conCategoria.category).toBe('pruebas')
    expect(sinCategoria.category).toBeUndefined()
  })
})

describe('pickRandomQuestions', () => {
  const banco = Array.from({ length: 5 }, (_, i) => ({
    ...questionWith(0),
    id: `q${i + 1}`,
  }))

  it('devuelve como máximo las preguntas pedidas', () => {
    expect(pickRandomQuestions(banco, 3)).toHaveLength(3)
  })

  it('devuelve menos si el banco es más pequeño que lo pedido', () => {
    // Se prefiere una partida corta a una partida con huecos inventados.
    expect(pickRandomQuestions(banco, 99)).toHaveLength(5)
  })

  it('devuelve vacío si no hay preguntas o se piden cero', () => {
    expect(pickRandomQuestions(banco, 0)).toEqual([])
    expect(pickRandomQuestions([], 5)).toEqual([])
  })

  it('normaliza números negativos o decimales a cero', () => {
    expect(pickRandomQuestions(banco, -3)).toEqual([])
    expect(pickRandomQuestions(banco, 2.9)).toHaveLength(2)
  })

  it('no repite preguntas dentro de la selección', () => {
    const elegidas = pickRandomQuestions(banco, 5)

    expect(new Set(elegidas.map((q) => q.id)).size).toBe(5)
  })
})

describe('removeUsedQuestions', () => {
  it('excluye las preguntas ya usadas', () => {
    const banco = [{ ...questionWith(0), id: 'a' }, { ...questionWith(0), id: 'b' }]

    expect(removeUsedQuestions(banco, ['a']).map((q) => q.id)).toEqual(['b'])
  })

  it('no modifica el banco original', () => {
    const banco = [{ ...questionWith(0), id: 'a' }]

    removeUsedQuestions(banco, ['a'])

    expect(banco).toHaveLength(1)
  })

  it('tolera lista de usados vacía, con ids repetidos o desconocidos', () => {
    const banco = [{ ...questionWith(0), id: 'a' }]

    expect(removeUsedQuestions(banco, [])).toHaveLength(1)
    expect(removeUsedQuestions(banco, ['a', 'a'])).toHaveLength(0)
    expect(removeUsedQuestions(banco, ['no-existe'])).toHaveLength(1)
  })
})

describe('isPlayableQuestion', () => {
  it('acepta una pregunta bien formada', () => {
    expect(isPlayableQuestion(questionWith(0))).toBe(true)
  })

  it('rechaza preguntas sin texto o con texto en blanco', () => {
    expect(isPlayableQuestion({ ...questionWith(0), text: '' })).toBe(false)
    expect(isPlayableQuestion({ ...questionWith(0), text: '   ' })).toBe(false)
    expect(isPlayableQuestion({ ...questionWith(0), text: null as unknown as string })).toBe(false)
  })

  it('rechaza preguntas con menos de 2 opciones o más de 4', () => {
    expect(isPlayableQuestion(questionWith(0, ['única']))).toBe(false)
    expect(isPlayableQuestion(questionWith(0, ['a', 'b', 'c', 'd', 'e']))).toBe(false)
  })

  it('rechaza correctIndex fuera de rango o no entero', () => {
    expect(isPlayableQuestion(questionWith(3))).toBe(false)
    expect(isPlayableQuestion(questionWith(-1))).toBe(false)
    expect(isPlayableQuestion(questionWith(0.5))).toBe(false)
  })

  it('rechaza un objeto que no es una pregunta', () => {
    expect(isPlayableQuestion(null as unknown as Question)).toBe(false)
    expect(isPlayableQuestion(undefined as unknown as Question)).toBe(false)
    expect(isPlayableQuestion({} as Question)).toBe(false)
  })
})

describe('coherencia global con el banco real de 3 opciones', () => {
  it('mantiene la integridad sobre las 10 preguntas del banco, en cualquier orden', () => {
    // Se reimporta el JSON real para que un cambio en el banco no rompa esta
    // prueba en silencio. Se valida contra la opción correcta declarada.
    const banco = seedBank()
    expect(banco).toHaveLength(10)

    for (const q of banco) {
      const correcta = q.options[q.correctIndex]
      expect(correcta).toBeDefined()

      for (let intento = 0; intento < 20; intento += 1) {
        const r = shuffleQuestion(q)
        expect(r.options).toHaveLength(3)
        expect(r.letters).toEqual(['A', 'B', 'C'])
        // La invariante que protege el juego: la letra señalada muestra el
        // texto correcto, sea cual sea la posición en que haya quedado.
        expect(r.options[r.correctIndex]).toBe(correcta)
      }
    }
  })

  it('no deja la respuesta correcta fija en A a lo largo de una partida simulada', () => {
    const banco = seedBank()
    const posicionesPorPregunta = banco.map((q) => {
      const vistas = new Set<number>()
      for (let i = 0; i < 30; i += 1) vistas.add(shuffleQuestion(q).correctIndex)
      return vistas.size
    })

    // Las 10 preguntas deben poder aparecer en las 3 posiciones a lo largo de
    // varias partidas; si alguna se quedara fija, el patrón sería deducible.
    expect(posicionesPorPregunta.every((n) => n === 3)).toBe(true)
  })
})

/** Carga el banco semilla real (el mismo archivo que consume la aplicación). */
function seedBank(): Question[] {
  return seedQuestions as Question[]
}
