import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { playedSounds } from '@/test/setup'
import { useGameStore } from '@/stores/game'
import { useQuestionBankStore } from '@/stores/questionBank'
import type { Question } from '@/types'
import GameScreen from './GameScreen.vue'

/** Banco de 10 preguntas, la correcta siempre en la posición 0. */
const BANCO: Question[] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Pregunta ${i + 1}`,
  options: ['correcta', 'falsa-1', 'falsa-2'],
  correctIndex: 0,
  difficulty: 'facil',
  category: 'Contabilidad',
}))

/** Prepara Pinia con banco, grupos y partida empezada. */
function preparar(numGrupos = 2, abiertas = false) {
  setActivePinia(createPinia())
  useQuestionBankStore().importBank(BANCO)
  const game = useGameStore()
  for (let i = 0; i < numGrupos; i += 1) game.addGroup(`Equipo ${i + 1}`)
  game.updateConfig({ questionCount: 3 })
  game.startGame()
  if (abiertas) game.beginQuestion()
  return game
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GameScreen', () => {
  it('muestra el enunciado y las opciones de la pregunta', () => {
    preparar()
    const wrapper = mount(GameScreen)

    expect(wrapper.text()).toContain('Pregunta 1')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
  })

  it('indica el valor en juego de la pregunta', () => {
    preparar()
    const wrapper = mount(GameScreen)

    expect(wrapper.text()).toContain('100 pts')
  })

  it('ofrece empezar la pregunta en la fase intro', async () => {
    const game = preparar()
    const wrapper = mount(GameScreen)

    const boton = wrapper.findAll('button').find((b) => b.text() === 'Empezar la pregunta')
    await boton?.trigger('click')

    expect(game.phase).toBe('open')
  })

  it('el botón de la fase open revela la respuesta', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    const boton = wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')
    await boton?.trigger('click')
    // El efecto de suspenso va antes de la respuesta, con su propio tempo.
    vi.advanceTimersByTime(1_500)
    await nextTick()

    expect(game.phase).toBe('reveal')
  })

  it('el botón de la fase reveal avanza a la siguiente pregunta', async () => {
    const game = preparar(2, true)
    game.reveal()
    const wrapper = mount(GameScreen)

    const boton = wrapper.findAll('button').find((b) => b.text() === 'Siguiente pregunta')
    await boton?.trigger('click')

    expect(game.questionNumber).toBe(2)
    expect(game.phase).toBe('intro')
  })

  it('registra la respuesta del grupo seleccionado y suena el blip', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('aside button')[0]?.trigger('click')
    await wrapper.findAll('[role="option"]')[0]?.trigger('click')
    await nextTick()

    expect(game.groups[0]?.currentAnswer).toBe(0)
    // El blip confirma al anfitrión que el clic quedó registrado.
    expect(playedSounds.length).toBeGreaterThan(0)
  })

  it('no registra nada si no se ha elegido grupo antes', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('[role="option"]')[0]?.trigger('click')

    expect(game.groups.every((g) => g.currentAnswer === null)).toBe(true)
  })

  it('el reloj arranca solo al pasar a la fase open', async () => {
    const game = preparar()
    const wrapper = mount(GameScreen)
    expect(wrapper.text()).toContain('30s')

    await wrapper.findAll('button').find((b) => b.text() === 'Empezar la pregunta')?.trigger('click')
    await nextTick()

    vi.advanceTimersByTime(5_000)
    await nextTick()

    expect(wrapper.text()).toContain('25s')
    expect(game.phase).toBe('open')
  })

  it('el reloj se para al revelar la respuesta', async () => {
    preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')?.trigger('click')
    await nextTick()
    vi.advanceTimersByTime(10_000)
    await nextTick()

    // Con la respuesta en pantalla el contador debe quedar congelado, no seguir
    // descontando mientras el anfitrión explica.
    expect(wrapper.text()).toContain('30s')
  })

  it('suena el suspenso antes de mostrar la respuesta', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')?.trigger('click')
    await nextTick()

    // El efecto de suspenso tiene que sonar antes de la respuesta: si la
    // pantalla se actualizara en el mismo instante, el "tum tum tum" se
    // perdería detrás del sonido de acierto o fallo.
    expect(playedSounds).toContain('/audio/suspense.mp3')
    expect(playedSounds).not.toContain('/audio/correct.mp3')
    expect(game.phase).toBe('open')

    // Y tras el tempo de televisión, la respuesta aparece.
    vi.advanceTimersByTime(1_500)
    await nextTick()

    expect(game.phase).toBe('reveal')
  })

  it('el reloj queda en pausa mientras suena el suspenso', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)
    await nextTick()
    vi.advanceTimersByTime(10_000)
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')?.trigger('click')
    await nextTick()
    // Menos que el tempo de suspenso: alargar el efecto no puede costarle
    // tiempo al grupo.
    vi.advanceTimersByTime(1_000)
    await nextTick()

    expect(wrapper.text()).toContain('20s')
    expect(game.phase).toBe('open')
  })

  it('no revela dos veces si se insiste en el botón', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    const botón = () => wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')
    await botón()?.trigger('click')
    await nextTick()
    await botón()?.trigger('click')
    await nextTick()

    vi.advanceTimersByTime(1_500)
    await nextTick()

    expect(game.history).toHaveLength(1)
  })

  it('anuncia que la revelación está en curso', async () => {
    preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')?.trigger('click')
    await nextTick()

    const botones = wrapper.findAll('button')
    expect(botones.some((b) => b.text() === 'Revelar respuesta')).toBe(false)
    expect(botones.some((b) => b.text() === 'Un momento…')).toBe(true)
    expect(botones.find((b) => b.text() === 'Un momento…')?.attributes('disabled')).toBeDefined()
  })

  it('cancela la revelación pendiente si se desmonta la pantalla', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')?.trigger('click')
    await nextTick()
    wrapper.unmount()
    vi.advanceTimersByTime(5_000)

    // Si el anfitrión vuelve atrás mientras suena el efecto, la respuesta no
    // debe saltar en la pantalla siguiente.
    expect(game.phase).toBe('open')
  })

  it('al agotarse el tiempo se revela y suenan los sonidos', async () => {
    // Se monta con la pregunta ya abierta: el reloj debe arrancar igualmente
    // al montarse, no solo cuando la fase cambia.
    const game = preparar(2, true)
    mount(GameScreen)
    await nextTick()

    vi.advanceTimersByTime(30_000)
    await nextTick()

    expect(game.phase).toBe('reveal')
    expect(game.history).toHaveLength(1)
  })

  it('arranca el reloj al abrir la pregunta desde la pantalla', async () => {
    const game = preparar()
    const wrapper = mount(GameScreen)
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text() === 'Empezar la pregunta')?.trigger('click')
    await nextTick()
    vi.advanceTimersByTime(30_000)
    await nextTick()

    expect(game.phase).toBe('reveal')
  })

  it('marca en verde la opción correcta al revelar', async () => {
    preparar(2, true)
    const wrapper = mount(GameScreen)

    await wrapper.findAll('button').find((b) => b.text() === 'Revelar respuesta')?.trigger('click')
    vi.advanceTimersByTime(1_500)
    await nextTick()

    expect(wrapper.find('.option-correct').exists()).toBe(true)
  })

  it('enseña el panel de grupos con sus nombres', () => {
    preparar(3)
    const wrapper = mount(GameScreen)

    expect(wrapper.find('aside').text()).toContain('Equipo 1')
    expect(wrapper.findAll('aside button')).toHaveLength(3)
  })

  it('el contador muestra el progreso de la partida', async () => {
    const game = preparar(2, true)
    const wrapper = mount(GameScreen)

    expect(wrapper.text()).toContain('1 / 3')

    game.reveal()
    await nextTick()
    await wrapper.findAll('button').find((b) => b.text() === 'Siguiente pregunta')?.trigger('click')

    expect(wrapper.text()).toContain('2 / 3')
  })

  it('funciona con un solo grupo sin romperse', () => {
    // El store impide empezar con uno solo, pero el componente debe aguantar
    // una partida en curso con un único participante.
    const game = preparar(2, true)
    game.removeGroup(game.groups[1]?.id ?? '')
    const wrapper = mount(GameScreen)

    expect(wrapper.findAll('aside button')).toHaveLength(1)
  })

  it('corta el reloj al desmontarse', async () => {
    preparar(2, true)
    const wrapper = mount(GameScreen)
    await nextTick()

    wrapper.unmount()
    vi.advanceTimersByTime(60_000)

    // Si el reloj siguiera vivo, dispararía la revelación de una partida que
    // ya no está en pantalla.
    expect(useGameStore().phase).toBe('open')
  })

  it('muestra la categoría de la pregunta', () => {
    preparar()
    const wrapper = mount(GameScreen)

    expect(wrapper.text()).toContain('Contabilidad')
  })
})
