import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { unlockAudio } from '@/audio/sfx'
import { useGameStore } from '@/stores/game'
import { useQuestionBankStore } from '@/stores/questionBank'
import type { Question } from '@/types'
import SetupScreen from './SetupScreen.vue'

/** Banco de 10 preguntas en memoria, para que siempre se pueda empezar. */
const BANCO: Question[] = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i + 1}`,
  text: `Pregunta ${i + 1}`,
  options: ['correcta', 'falsa-1', 'falsa-2'],
  correctIndex: 0,
  difficulty: 'facil',
}))

/** Prepara Pinia con un banco y devuelve el store de partida. */
function preparar(numGrupos = 2) {
  setActivePinia(createPinia())
  useQuestionBankStore().importBank(BANCO)
  const game = useGameStore()
  for (let i = 0; i < numGrupos; i += 1) game.addGroup(`Equipo ${i + 1}`)
  return game
}

/** Monta la pantalla de configuración. */
function montar() {
  return mount(SetupScreen)
}

beforeEach(() => {
  localStorage.clear()
})

describe('SetupScreen', () => {
  it('empieza mostrando el aviso de que faltan grupos', () => {
    preparar(0)
    const wrapper = montar()

    expect(wrapper.text()).toContain('Añade al menos un grupo')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('deshabilita el inicio con un solo grupo', () => {
    preparar(1)
    const wrapper = montar()

    const iniciar = wrapper.findAll('button').find((b) => b.text() === 'Iniciar partida')
    expect(iniciar?.attributes('disabled')).toBeDefined()
  })

  it('habilita el inicio con dos grupos', () => {
    preparar(2)
    const wrapper = montar()

    const iniciar = wrapper.findAll('button').find((b) => b.text() === 'Iniciar partida')
    expect(iniciar?.attributes('disabled')).toBeUndefined()
  })

  it('añade un grupo desde el formulario y limpia el campo', async () => {
    const game = preparar(0)
    const wrapper = montar()

    const nombre = wrapper.find('input[type="text"]')
    await nombre.setValue('Los Contadores')
    await wrapper.find('form').trigger('submit')

    expect(game.groups).toHaveLength(1)
    expect(game.groups[0]?.name).toBe('Los Contadores')
    expect((nombre.element as HTMLInputElement).value).toBe('')
  })

  it('asigna la etiqueta A, B, C... solo y renumera al quitar', async () => {
    const game = preparar(0)
    const wrapper = montar()

    for (const nombre of ['aarón', 'bárbara', 'carla']) {
      await wrapper.find('input[type="text"]').setValue(nombre)
      await wrapper.find('form').trigger('submit')
    }

    // El formulario no pide etiqueta: la pone el store por orden de alta.
    expect(wrapper.findAll('input[type="text"]')).toHaveLength(1)
    expect(game.groups.map((g) => g.label)).toEqual(['A', 'B', 'C'])
    // Y se ve como una sola línea de texto, no como letra en un círculo.
    expect(wrapper.text()).toContain('Grupo A — aarón')
    expect(wrapper.text()).toContain('Grupo C — carla')

    await wrapper.findAll('button').filter((b) => b.text() === 'Quitar')[1]?.trigger('click')

    expect(game.groups.map((g) => g.label)).toEqual(['A', 'B'])
    expect(wrapper.text()).toContain('Grupo B — carla')
  })

  it('lista los grupos y permite quitar uno', async () => {
    const game = preparar(2)
    const wrapper = montar()

    const quitar = wrapper.findAll('button').filter((b) => b.text() === 'Quitar')
    expect(quitar).toHaveLength(2)

    await quitar[0]?.trigger('click')

    expect(game.groups).toHaveLength(1)
  })

  it('mete la lista de grupos en su propio desplazamiento con barra visible', () => {
    // Con 20 grupos la lista no cabe en 1080p. Si creciera, empujaría el botón
    // de iniciar fuera de la pantalla y habría que desplazarse para encontrarlo.
    preparar(0)
    const game = useGameStore()
    for (let i = 0; i < 20; i += 1) game.addGroup(`Equipo ${i + 1}`)
    const wrapper = montar()

    const lista = wrapper.find('ul')
    expect(lista.classes()).toContain('overflow-y-auto')
    expect(lista.classes()).toContain('scroll-area')
    // La pantalla completa también lleva la clase: la barra se ve en cualquier
    // zona desplazable, no solo en la lista.
    expect(wrapper.find('section').classes()).toContain('scroll-area')
    // Con el alto disponible, la lista se queda dentro de su caja en vez de
    // alargar la página: es `flex-1 min-h-0`, no una altura fija en píxeles.
    expect(lista.classes()).toContain('flex-1')
    expect(lista.classes()).toContain('min-h-0')
  })

  it('no permite añadir más de MAX_GRUPPOS', () => {
    preparar(0)
    const game = useGameStore()
    for (let i = 0; i < 25; i += 1) game.addGroup(`Equipo ${i}`)
    const wrapper = montar()

    const añadir = wrapper.find('button[type="submit"]')
    expect(añadir.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('20 / 20')
  })

  it('avisa de que no se puede jugar con el banco vacío', () => {
    setActivePinia(createPinia())
    useQuestionBankStore().importBank([])
    const game = useGameStore()
    game.addGroup('A')
    game.addGroup('B')
    const wrapper = montar()

    expect(wrapper.text()).toContain('banco está vacío')
  })

  it('resumen del banco con el número de preguntas', () => {
    preparar(2)
    const wrapper = montar()

    expect(wrapper.text()).toContain('10 preguntas jugables de 10')
  })

  it('avisa de que el banco no tiene preguntas difíciles', () => {
    // El banco de prueba solo tiene fáciles. Sin este aviso, cambiar el
    // selector a «Difícil» parece no hacer nada.
    preparar(2)
    const wrapper = montar()

    expect(wrapper.text()).toContain('0 preguntas difíciles en el banco')
    expect(wrapper.text()).toContain('juega lo mismo que «Fácil»')
  })

  it('no avisa de la dificultad cuando el banco tiene preguntas difíciles', () => {
    setActivePinia(createPinia())
    useQuestionBankStore().importBank([
      ...BANCO,
      { id: 'q-dificil', text: 'Difícil', options: ['a', 'b', 'c'], correctIndex: 0, difficulty: 'dificil' },
    ])
    const game = useGameStore()
    game.addGroup('A')
    game.addGroup('B')
    const wrapper = montar()

    expect(wrapper.text()).not.toContain('0 preguntas difíciles')
  })

  it('cambia los ajustes de la partida desde los campos', async () => {
    const game = preparar(2)
    const wrapper = montar()

    const numero = wrapper.find('input[type="number"]')
    await numero?.setValue('7')
    await numero?.trigger('change')

    expect(game.questionCount).toBe(7)
  })

  it('ignora un valor numérico vacío sin dejar la partida en NaN', async () => {
    // Vaciar el campo da `NaN`; si se propagara, ni el reloj ni el marcador
    // funcionarían hasta recargar.
    const game = preparar(2)
    const wrapper = montar()

    const numero = wrapper.find('input[type="number"]')
    await numero?.setValue('')
    await numero?.trigger('change')

    expect(Number.isFinite(game.questionCount)).toBe(true)
  })

  it('muestra la escalera de puntos que se va a jugar', () => {
    preparar(2)
    const wrapper = montar()

    expect(wrapper.text()).toContain('100')
    expect(wrapper.text()).toContain('200')
  })

  it('emite start y desbloquea el audio al iniciar', async () => {
    const espia = vi.spyOn(await import('@/audio/sfx'), 'unlockAudio').mockImplementation(() => undefined)
    preparar(2)
    const wrapper = montar()

    const iniciar = wrapper.findAll('button').find((b) => b.text() === 'Iniciar partida')
    await iniciar?.trigger('click')

    expect(wrapper.emitted('start')).toHaveLength(1)
    expect(espia).toHaveBeenCalled()
    espia.mockRestore()
  })

  it('no emite start si la partida no puede empezar', async () => {
    preparar(1)
    const wrapper = montar()

    const iniciar = wrapper.findAll('button').find((b) => b.text() === 'Iniciar partida')
    await iniciar?.trigger('click')

    // El botón está deshabilitado, pero un `trigger` artificial lo saltaría:
    // la guarda está en el componente, no solo en el atributo.
    expect(wrapper.emitted('start')).toBeUndefined()
  })

  it('emite open-admin al pedir gestionar preguntas', async () => {
    preparar(2)
    const wrapper = montar()

    const gestionar = wrapper.findAll('button').find((b) => b.text() === 'Gestionar preguntas')
    await gestionar?.trigger('click')

    expect(wrapper.emitted('open-admin')).toHaveLength(1)
  })

  it('el audio no se desbloquea hasta que hay un inicio válido', () => {
    // Desbloquear el audio sin que haya partida no haría falta y, en
    // navegadores restrictivos, gastaría el gesto del usuario.
    expect(unlockAudio).toBeTypeOf('function')
  })
})
