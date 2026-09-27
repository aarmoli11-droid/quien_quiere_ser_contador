import type { Group, GroupAnswer } from '@/types'

/**
 * Resultado de ordenar los grupos para la tabla de posiciones.
 * `rank` es 1-based y se comparte cuando hay empate.
 */
export interface RankedGroup extends Group {
  rank: number
  /** `true` si comparte el último puesto ocupado con otro grupo. */
  tied: boolean
}

/**
 * Calcula los puntos de una pregunta según su número dentro de la partida.
 *
 * Reproduce la escalera del programa original (cada vale más que el anterior)
 * pero en puntos, nunca en dinero. El número es 1-based: la primera pregunta
 * vale `basePoints`, la segunda `basePoints + pointsStep`, y así sucesivamente.
 *
 * Un `questionNumber` inválido (0, negativo, NaN) se trata como 1 para que el
 * juego nunca reparta una puntuación negativa o infinita por un error de estado.
 */
export function pointsForQuestion(questionNumber: number, basePoints: number, pointsStep: number): number {
  const n = Number.isFinite(questionNumber) ? Math.max(1, Math.trunc(questionNumber)) : 1
  // `basePoints` negativo rompería la lógica de "quien más suma, gana", así que
  // se fija en 0 en el peor caso.
  const base = Number.isFinite(basePoints) ? Math.max(0, basePoints) : 0
  const step = Number.isFinite(pointsStep) ? Math.max(0, pointsStep) : 0
  return base + (n - 1) * step
}

/**
 * Ordena los grupos de mayor a menor puntuación y asigna el puesto.
 *
 * El desempate en la ordenación es alfabético por nombre, para que la tabla
 * salga estable entre partidas y no cambie de orden sola. El puesto se reparte
 * de forma clásica: dos grupos con la misma puntuación comparten el mismo
 * `rank`, y el siguiente salta al número correspondiente.
 */
export function rankGroups(groups: readonly Group[]): RankedGroup[] {
  const ordenados = [...groups].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.name.localeCompare(b.name, 'es')
  })

  // `rank` se calcula en una sola pasada: si el grupo tiene la misma
  // puntuación que el anterior hereda su puesto, y si no, ocupa la posición
  // siguiente. Así los empates comparten puesto de forma clásica y el número
  // salta automáticamente al siguiente valor disponible.
  const puestos: number[] = []
  ordenados.forEach((group, indice) => {
    const anterior = ordenados[indice - 1]
    const heredaPuesto = anterior !== undefined && anterior.score === group.score
    puestos.push(heredaPuesto ? (puestos[indice - 1] ?? indice + 1) : indice + 1)
  })

  // Un grupo está empatado si hay más de uno con su misma puntuación en
  // cualquier posición, no solo en el primer puesto.
  const countByScore = new Map<number, number>()
  for (const group of ordenados) {
    countByScore.set(group.score, (countByScore.get(group.score) ?? 0) + 1)
  }

  return ordenados.map((group, indice) => ({
    ...group,
    rank: puestos[indice] ?? indice + 1,
    tied: (countByScore.get(group.score) ?? 0) > 1,
  }))
}

/**
 * Devuelve los grupos que encabezan la tabla.
 *
 * Es la base del desempate: si la devuelve con más de un elemento hay empate y
 * hay que sortear una pregunta adicional solo entre esos grupos. Con un único
 * grupo (o con una lista vacía) no hay empate y no se sortea nada.
 */
export function findLeaders(groups: readonly Group[]): Group[] {
  if (groups.length === 0) return []

  const maxScore = groups.reduce((max, group) => Math.max(max, group.score), Number.NEGATIVE_INFINITY)
  return groups.filter((group) => group.score === maxScore)
}

/** `true` si hay dos o más grupos empatados en el primer puesto. */
export function hasTie(groups: readonly Group[]): boolean {
  return findLeaders(groups).length > 1
}

/**
 * Devuelve el subconjunto de grupos que sigue compitiendo en un desempate.
 *
 * Si no hay empate devuelve una lista vacía, para que la interfaz no ofrezca
 * nunca una ronda de desempate cuando ya hay ganador único.
 */
export function tiebreakContenders(groups: readonly Group[], contenders: readonly string[]): Group[] {
  if (contenders.length < 2) return []
  const enJuego = new Set(contenders)
  return groups.filter((group) => enJuego.has(group.id))
}

/**
 * Suma los puntos de una ronda a cada grupo y devuelve copias actualizadas.
 *
 * No muta los grupos recibidos, para que el store pueda conservar el historial
 * de rondas y poder deshacer. Los grupos que no aparecen en `answers` (porque
 * no respondieron o porque se agotó el tiempo) se copian sin cambios, con 0
 * puntos añadidos, que es el resultado correcto según las reglas.
 */
export function applyRoundPoints(groups: readonly Group[], answers: readonly GroupAnswer[]): Group[] {
  const puntosPorGrupo = new Map<string, number>()
  for (const answer of answers) {
    // `Number.isFinite` antes que `Math.max` porque `Math.max(0, NaN)` devuelve
    // NaN: un solo dato corrupto en una respuesta envenenaría la puntuación
    // total del grupo y rompería la tabla de posiciones.
    const delta = Number.isFinite(answer.pointsAwarded) ? Math.max(0, answer.pointsAwarded) : 0
    puntosPorGrupo.set(answer.groupId, (puntosPorGrupo.get(answer.groupId) ?? 0) + delta)
  }

  return groups.map((group) => {
    const delta = puntosPorGrupo.get(group.id) ?? 0
    return delta === 0 ? { ...group } : { ...group, score: group.score + delta }
  })
}

/** Formatea un número de puntos con el formato de miles esperado en pantalla. */
export function formatPoints(score: number): string {
  if (!Number.isFinite(score)) return '0'
  return new Intl.NumberFormat('es-CR').format(Math.trunc(score))
}
