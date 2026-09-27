import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useGameStore } from '@/stores/game'
import { useQuestionBankStore } from '@/stores/questionBank'
import type { Question } from '@/types'
import ResultsScreen from './ResultsScreen.vue'

/** Banco de 4 preguntas para poder llegar al final con desempate. */
const BANCO: Question[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Pregunta ${i + 1}`,
  options: ['correcta', 'falsa-1', 'falsa-2'],
  correctIndex: 0,
  difficulty: 'facil',
}))

/** Prepara Pinia con banco y grupos. */
function preparar(numGrupos = 3) {
  setActivePinia(createPinia())
  useQuestionBankStore().importBank(BANCO)
  const game = useGameStore()
  for (let i = 0; i < numGrupos; i += 1) game.addGroup(`Equipo ${i + 1}`)
  return game
}

/**
 * Juega una partida de una sola pregunta.
 *
 * `aciertos` indica qué grupos (por posición) aciertan y `fallos` cuáles eligen
 * mal. No se puede pasar un índice fijo: el tablero mezcla las opciones al cargar
 * la pregunta, así que la correcta no está donde estaba en el banco.
 */
function partidaConRespuestas(aciertos: number[], numGrupos = 3) {
  const game = preparar(numGrupos)
  game.updateConfig({ questionCount: 1 })
  game.startGame()
  game.beginQuestion()

  const correcta = game.current?.correctIndex ?? 0
  // Una opción distinta de la correcta, para simular un fallo.
  const incorrecta = correcta === 0 ? 1 : 0

  for (const posicion of aciertos) {
    const grupo = game.groups[posicion]
    if (grupo === undefined) continue
    game.selectGroup(grupo.id)
    game.registerAnswer(correcta)
  }
  for (let posicion = 0; posicion < game.groups.length; posicion += 1) {
    if (aciertos.includes(posicion)) continue
    const grupo = game.groups[posicion]
    if (grupo === undefined) continue
    game.selectGroup(grupo.id)
    game.registerAnswer(incorrecta)
  }

  game.reveal()
  game.nextQuestion()
  return game
}

beforeEach(() => {
  localStorage.clear()
})

describe('ResultsScreen', () => {
  it('anuncia al ganador cuando no hay empate', () => {
    partidaConRespuestas([0])
    const wrapper = mount(ResultsScreen)

    // Con letra y nombre en un texto, como en el panel de grupos.
    expect(wrapper.text()).toContain('Ganan los Grupo A — Equipo 1')
  })

  it('lista todos los grupos en la tabla', () => {
    partidaConRespuestas([0])
    const wrapper = mount(ResultsScreen)
    const filas = wrapper.findAll('tbody tr')

    expect(filas).toHaveLength(3)
    expect(wrapper.text()).toContain('Equipo 1')
    expect(wrapper.text()).toContain('Equipo 3')
  })

  it('ordena la tabla de mayor a menor puntuación', () => {
    // Solo acierta el segundo equipo: debe salir primero aunque se registrara
    // después, porque la tabla se ordena por puntuación, no por orden de alta.
    partidaConRespuestas([1])
    const wrapper = mount(ResultsScreen)
    const primeraFila = wrapper.findAll('tbody tr')[0]?.text() ?? ''

    expect(primeraFila).toContain('Equipo 2')
    expect(primeraFila).toContain('100')
  })

  it('ofrece el desempate cuando hay empate en la cabecera', () => {
    // Nadie acierta: los tres quedan en cero y hay empate en la cabecera.
    partidaConRespuestas([])
    const wrapper = mount(ResultsScreen)

    const boton = wrapper.findAll('button').find((b) => b.text() === 'Jugar el desempate')
    expect(boton).toBeDefined()
    expect(wrapper.text()).toContain('Empate entre 3 grupos')
  })

  it('empieza el desempate al pulsar el botón', async () => {
    const game = partidaConRespuestas([])
    const wrapper = mount(ResultsScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Jugar el desempate')?.trigger('click')

    expect(game.isTiebreak).toBe(true)
    expect(game.phase).toBe('intro')
  })

  it('avisa si no quedan preguntas para desempatar', async () => {
    // Con una sola pregunta en el banco no queda nada libre después de jugar.
    // Es preferible avisar a repetir una pregunta ya respondida, que no
    // resolvería el empate.
    setActivePinia(createPinia())
    useQuestionBankStore().importBank(BANCO.slice(0, 1))
    const game = useGameStore()
    game.addGroup('A')
    game.addGroup('B')
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()

    const wrapper = mount(ResultsScreen)
    await wrapper.findAll('button').find((b) => b.text() === 'Jugar el desempate')?.trigger('click')

    expect(game.phase).toBe('results')
    expect(wrapper.text()).toContain('No quedan preguntas')
  })

  it('marca el empate en la tabla', () => {
    partidaConRespuestas([0, 1])
    const wrapper = mount(ResultsScreen)

    // Los dos primeros equipos aciertan la misma pregunta: empate en el
    // primer puesto, y hay que decirlo en la clasificación.
    expect(wrapper.text()).toContain('(empate)')
  })

  it('emite back al volver a la configuración', async () => {
    partidaConRespuestas([0])
    const wrapper = mount(ResultsScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Volver a la configuración')?.trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('no ofrece desempate si ya hay ganador', () => {
    partidaConRespuestas([0])
    const wrapper = mount(ResultsScreen)

    expect(wrapper.findAll('button').some((b) => b.text() === 'Jugar el desempate')).toBe(false)
  })

  it('funciona con 20 grupos sin romperse', () => {
    partidaConRespuestas([0], 20)
    const wrapper = mount(ResultsScreen)

    expect(wrapper.findAll('tbody tr')).toHaveLength(20)
  })
})
