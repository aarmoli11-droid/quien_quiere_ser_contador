import { describe, expect, it } from 'vitest'

import type { Group, GroupAnswer } from '@/types'
import {
  applyRoundPoints,
  findLeaders,
  formatPoints,
  hasTie,
  pointsForQuestion,
  rankGroups,
  tiebreakContenders,
} from './scoring'

/** Construye un grupo de prueba con valores por defecto. */
function group(id: string, score: number, name = `Grupo ${id}`): Group {
  return { id, name, label: name, score, currentAnswer: null }
}

describe('pointsForQuestion', () => {
  it('sube en la escalera en cada pregunta', () => {
    // Escalera de 100 en 100: replica la escalada del programa sin usar dinero.
    expect(pointsForQuestion(1, 100, 100)).toBe(100)
    expect(pointsForQuestion(2, 100, 100)).toBe(200)
    expect(pointsForQuestion(3, 100, 100)).toBe(300)
    expect(pointsForQuestion(10, 100, 100)).toBe(1000)
  })

  it('respeta una base y un incremento distintos', () => {
    expect(pointsForQuestion(1, 50, 25)).toBe(50)
    expect(pointsForQuestion(2, 50, 25)).toBe(75)
    expect(pointsForQuestion(5, 50, 25)).toBe(150)
  })

  it('funciona con incremento cero (todas valen lo mismo)', () => {
    expect(pointsForQuestion(1, 200, 0)).toBe(200)
    expect(pointsForQuestion(9, 200, 0)).toBe(200)
  })

  it('normaliza números de pregunta inválidos a 1', () => {
    // Nunca debe repartir 0, negativo, NaN o Infinity: rompería la tabla.
    // Un número decimal se trunca hacia abajo, así que 1.9 cuenta como primera.
    expect(pointsForQuestion(0, 100, 100)).toBe(100)
    expect(pointsForQuestion(-5, 100, 100)).toBe(100)
    expect(pointsForQuestion(1.9, 100, 100)).toBe(100)
    expect(pointsForQuestion(2.9, 100, 100)).toBe(200)
    expect(pointsForQuestion(Number.NaN, 100, 100)).toBe(100)
    expect(pointsForQuestion(Number.POSITIVE_INFINITY, 100, 100)).toBe(100)
  })

  it('nunca devuelve una puntuación negativa', () => {
    expect(pointsForQuestion(1, -500, 100)).toBe(0)
    expect(pointsForQuestion(3, 100, -50)).toBe(100)
  })
})

describe('rankGroups', () => {
  it('ordena de mayor a menor puntuación', () => {
    const tabla = rankGroups([group('a', 100), group('b', 300), group('c', 200)])

    expect(tabla.map((g) => g.id)).toEqual(['b', 'c', 'a'])
    expect(tabla.map((g) => g.rank)).toEqual([1, 2, 3])
  })

  it('comparte puesto entre los empatados y salta el número', () => {
    const tabla = rankGroups([group('a', 100), group('b', 200), group('c', 200), group('d', 50)])

    expect(tabla.map((g) => [g.id, g.rank])).toEqual([
      ['b', 1],
      ['c', 1],
      ['a', 3],
      ['d', 4],
    ])
  })

  it('marca como empatados a todos los grupos con la misma puntuación', () => {
    const tabla = rankGroups([group('a', 100), group('b', 100), group('c', 50)])

    expect(tabla.find((g) => g.id === 'a')?.tied).toBe(true)
    expect(tabla.find((g) => g.id === 'b')?.tied).toBe(true)
    expect(tabla.find((g) => g.id === 'c')?.tied).toBe(false)
  })

  it('desempata de forma estable por nombre', () => {
    // Orden alfabético para que la tabla no se reordene sola entre partidas.
    const tabla = rankGroups([group('z', 100, 'Zeta'), group('a', 100, 'Alfa')])

    expect(tabla.map((g) => g.name)).toEqual(['Alfa', 'Zeta'])
  })

  it('no muta la lista recibida', () => {
    const original = [group('a', 100), group('b', 300)]
    rankGroups(original)

    expect(original.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('maneja el caso límite de 0, 1 y 50 grupos', () => {
    expect(rankGroups([])).toEqual([])
    expect(rankGroups([group('a', 0)])).toHaveLength(1)

    const muchos = Array.from({ length: 50 }, (_, i) => group(`g${i}`, i))
    const tabla = rankGroups(muchos)

    expect(tabla).toHaveLength(50)
    expect(tabla[0]?.id).toBe('g49')
  })

  it('marca empate cuando todos los grupos tienen 0 puntos', () => {
    // Caso real: partida corta donde nadie acertó nada.
    const tabla = rankGroups([group('a', 0), group('b', 0), group('c', 0)])

    expect(tabla.every((g) => g.tied)).toBe(true)
    expect(tabla.every((g) => g.rank === 1)).toBe(true)
  })
})

describe('findLeaders y hasTie', () => {
  it('devuelve vacío si no hay grupos', () => {
    expect(findLeaders([])).toEqual([])
    expect(hasTie([])).toBe(false)
  })

  it('devuelve el único líder cuando no hay empate', () => {
    const leaders = findLeaders([group('a', 100), group('b', 300)])

    expect(leaders).toHaveLength(1)
    expect(leaders[0]?.id).toBe('b')
    expect(hasTie([group('a', 100), group('b', 300)])).toBe(false)
  })

  it('devuelve todos los empatados en el primer puesto', () => {
    const grupos = [group('a', 300), group('b', 300), group('c', 100)]
    const leaders = findLeaders(grupos)

    expect(leaders.map((g) => g.id).sort()).toEqual(['a', 'b'])
    expect(hasTie(grupos)).toBe(true)
  })

  it('detecta empate entre los 50 grupos si todos empatan', () => {
    const grupos = Array.from({ length: 50 }, (_, i) => group(`g${i}`, 100))

    expect(findLeaders(grupos)).toHaveLength(50)
    expect(hasTie(grupos)).toBe(true)
  })

  it('funciona con puntuaciones negativas', () => {
    const grupos = [group('a', -10), group('b', -20)]

    expect(findLeaders(grupos).map((g) => g.id)).toEqual(['a'])
    expect(hasTie(grupos)).toBe(false)
  })

  it('no confunde empate en posiciones bajas con empate en el líder', () => {
    // Los dos últimos empatan, pero hay un ganador claro arriba.
    const grupos = [group('a', 500), group('b', 100), group('c', 100)]

    expect(hasTie(grupos)).toBe(false)
    expect(findLeaders(grupos).map((g) => g.id)).toEqual(['a'])
  })
})

describe('tiebreakContenders', () => {
  it('filtra solo los grupos indicados', () => {
    const grupos = [group('a', 300), group('b', 300), group('c', 100)]
    const seleccionados = tiebreakContenders(grupos, ['a', 'b'])

    expect(seleccionados.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('no ofrece desempate si hay menos de 2 participantes', () => {
    // Regla clave: con un solo participante no hay nada que desempatar.
    const grupos = [group('a', 300), group('b', 300)]

    expect(tiebreakContenders(grupos, ['a'])).toEqual([])
    expect(tiebreakContenders(grupos, [])).toEqual([])
  })

  it('ignora ids que no corresponden a ningún grupo', () => {
    const grupos = [group('a', 300)]
    const resultado = tiebreakContenders(grupos, ['a', 'fantasma'])

    expect(resultado.map((g) => g.id)).toEqual(['a'])
  })

  it('devuelve vacío si no hay grupos en absoluto', () => {
    expect(tiebreakContenders([], ['a', 'b'])).toEqual([])
  })
})

describe('applyRoundPoints', () => {
  const grupos = [group('a', 0), group('b', 0), group('c', 0)]

  it('suma los puntos de cada grupo que acertó', () => {
    const answers: GroupAnswer[] = [
      { groupId: 'a', optionIndex: 0, correct: true, pointsAwarded: 100 },
      { groupId: 'b', optionIndex: 1, correct: false, pointsAwarded: 0 },
    ]
    const nuevos = applyRoundPoints(grupos, answers)

    expect(nuevos.find((g) => g.id === 'a')?.score).toBe(100)
    expect(nuevos.find((g) => g.id === 'b')?.score).toBe(0)
    expect(nuevos.find((g) => g.id === 'c')?.score).toBe(0)
  })

  it('deja en 0 a los grupos que no respondieron o se agotó el tiempo', () => {
    // Un grupo que no aparece en `answers` conserva su puntuación: 0 en la ronda.
    const nuevos = applyRoundPoints(grupos, [])

    expect(nuevos.every((g) => g.score === 0)).toBe(true)
  })

  it('acumula entre rondas successive', () => {
    const trasPrimera = applyRoundPoints(grupos, [
      { groupId: 'a', optionIndex: 0, correct: true, pointsAwarded: 100 },
    ])
    const trasSegunda = applyRoundPoints(trasPrimera, [
      { groupId: 'a', optionIndex: 0, correct: true, pointsAwarded: 200 },
    ])

    expect(trasSegunda.find((g) => g.id === 'a')?.score).toBe(300)
  })

  it('no muta los grupos originales', () => {
    // Necesario para conservar el historial y poder mostrarlo en pantalla.
    const antes = grupos.map((g) => g.score)
    applyRoundPoints(grupos, [{ groupId: 'a', optionIndex: 0, correct: true, pointsAwarded: 100 }])

    expect(grupos.map((g) => g.score)).toEqual(antes)
  })

  it('descarta puntuaciones negativas o corruptas', () => {
    const nuevos = applyRoundPoints(grupos, [
      { groupId: 'a', optionIndex: 0, correct: true, pointsAwarded: -500 },
      { groupId: 'b', optionIndex: 0, correct: true, pointsAwarded: Number.NaN },
    ])

    expect(nuevos.find((g) => g.id === 'a')?.score).toBe(0)
    expect(nuevos.find((g) => g.id === 'b')?.score).toBe(0)
  })

  it('ignora respuestas de grupos que no están en la partida', () => {
    const nuevos = applyRoundPoints(grupos, [
      { groupId: 'fantasma', optionIndex: 0, correct: true, pointsAwarded: 999 },
    ])

    expect(nuevos).toHaveLength(3)
  })
})

describe('formatPoints', () => {
  it('añade el separador de miles', () => {
    expect(formatPoints(1000)).toMatch(/1/)
    expect(formatPoints(0)).toBe('0')
  })

  it('devuelve 0 ante valores no numéricos', () => {
    expect(formatPoints(Number.NaN)).toBe('0')
    expect(formatPoints(Number.POSITIVE_INFINITY)).toBe('0')
  })
})
