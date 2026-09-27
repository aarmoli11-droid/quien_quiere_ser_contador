import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Question } from '@/types'
import { useGameStore } from '@/stores/game'
import { useQuestionBankStore } from '@/stores/questionBank'
import App from './App.vue'

const BANCO: Question[] = Array.from({ length: 6 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Pregunta ${i + 1}`,
  options: ['correcta', 'falsa-1', 'falsa-2'],
  correctIndex: 0,
  difficulty: 'facil',
}))

/**
 * Monta la aplicación con un banco y dos grupos listos para jugar.
 *
 * Se usa `App` y no la pantalla concreta porque lo que se comprueba aquí es el
 * enrutado por fases, que es justo lo que decide `App`.
 */
function montar() {
  setActivePinia(createPinia())
  useQuestionBankStore().importBank(BANCO)
  const game = useGameStore()
  game.addGroup('Equipo 1')
  game.addGroup('Equipo 2')
  return { wrapper: mount(App), game }
}

beforeEach(() => {
  localStorage.clear()
})

describe('App', () => {
  it('empieza en la configuración', () => {
    const { wrapper } = montar()

    expect(wrapper.text()).toContain('Banco de preguntas')
    expect(wrapper.text()).toContain('Iniciar partida')
  })

  it('cambia a la arena al empezar la partida', async () => {
    const { wrapper, game } = montar()

    game.startGame()
    await wrapper.vm.$nextTick()

    expect(game.phase).toBe('intro')
    expect(wrapper.text()).not.toContain('Iniciar partida')
  })

  it('muestra la pantalla de resultados al terminar', async () => {
    const { wrapper, game } = montar()
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.beginQuestion()
    game.selectGroup(game.groups[0]?.id ?? '')
    game.registerAnswer(game.current?.correctIndex ?? 0)
    game.reveal()
    game.nextQuestion()
    await wrapper.vm.$nextTick()

    expect(game.phase).toBe('results')
    expect(wrapper.text()).toContain('Clasificación final')
  })

  it('vuelve a la configuración desde los resultados', async () => {
    const { wrapper, game } = montar()
    game.updateConfig({ questionCount: 1 })
    game.startGame()
    game.reveal()
    game.nextQuestion()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find((b) => b.text() === 'Volver a la configuración')?.trigger('click')

    expect(game.phase).toBe('setup')
    expect(wrapper.text()).toContain('Iniciar partida')
  })

  it('vuelve a la configuración al salir de la partida', async () => {
    // El enrutado por fases tiene que reaccionar al botón de salir igual que
    // reacciona al de los resultados: si no, el clic se quedaría en la arena.
    const { wrapper, game } = montar()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    game.startGame()
    game.beginQuestion()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find((b) => b.text() === 'Salir de la partida')?.trigger('click')
    await wrapper.vm.$nextTick()

    expect(game.phase).toBe('setup')
    expect(wrapper.text()).toContain('Iniciar partida')
  })

  it('mantiene el banco al salir de la partida', async () => {
    const { wrapper, game } = montar()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    game.startGame()
    game.beginQuestion()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('button').find((b) => b.text() === 'Salir de la partida')?.trigger('click')
    await wrapper.vm.$nextTick()

    // Lo que se pierde es la partida, no el trabajo de escribir las preguntas.
    expect(useQuestionBankStore().questions).toHaveLength(BANCO.length)
    expect(game.groups).toHaveLength(2)
  })

  it('abre y cierra el panel del banco de preguntas', async () => {
    const { wrapper } = montar()

    await wrapper.findAll('button').find((b) => b.text() === 'Gestionar preguntas')?.trigger('click')
    expect(wrapper.text()).toContain('Copia de seguridad')
    // El panel tapa la pantalla de debajo: si no, se leerían las dos a la vez.
    expect(wrapper.text()).not.toContain('Iniciar partida')

    await wrapper.findAll('button').find((b) => b.text() === 'Cerrar')?.trigger('click')
    expect(wrapper.text()).toContain('Iniciar partida')
  })

  it('mantiene el panel del banco abierto aunque avance la partida', async () => {
    const { wrapper, game } = montar()
    await wrapper.findAll('button').find((b) => b.text() === 'Gestionar preguntas')?.trigger('click')

    game.startGame()
    game.beginQuestion()
    await wrapper.vm.$nextTick()

    // El panel se superpone, así que la partida sigue su curso detrás y no se
    // reinicia al cerrarlo.
    expect(wrapper.text()).toContain('Copia de seguridad')
    expect(game.phase).toBe('open')

    await wrapper.findAll('button').find((b) => b.text() === 'Cerrar')?.trigger('click')
    expect(game.phase).toBe('open')
    expect(wrapper.text()).not.toContain('Copia de seguridad')
  })

  it('pinta siempre el fondo del escenario', () => {
    const { wrapper } = montar()

    // El decorado es la base de la que todas las pantallas se apoyan.
    expect(wrapper.findComponent({ name: 'StageBackdrop' }).exists()).toBe(true)
  })
})
