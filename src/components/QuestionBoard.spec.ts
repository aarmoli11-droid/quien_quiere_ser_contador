import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import QuestionBoard from './QuestionBoard.vue'
import type { ShuffledQuestion } from '@/types'

/**
 * Pregunta de ejemplo, ya mezclada, con la correcta en la posición 1.
 *
 * `difficulty` y `letters` se fijan siempre: son obligatorios en
 * `ShuffledQuestion` y un `undefined` explícito no es asignable al tipo.
 */
function pregunta(overrides: Partial<ShuffledQuestion> = {}): ShuffledQuestion {
  return {
    id: 'q1',
    text: '¿Cuál es el principio de devengo?',
    options: ['Se registra al cobrar', 'Se registra al devengarlo', 'Solo en efectivo'],
    correctIndex: 1,
    difficulty: 'facil',
    letters: ['A', 'B', 'C'],
    ...overrides,
  }
}

/** Monta el tablero con la pregunta dada. */
function montar(props: { question: ShuffledQuestion; revealed?: boolean }) {
  return mount(QuestionBoard, { props: { revealed: false, ...props } })
}

describe('QuestionBoard', () => {
  it('muestra una opción por cada opción de la pregunta', () => {
    const wrapper = montar({ question: pregunta() })

    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
  })

  it('admite preguntas de 2 y de 4 opciones', () => {
    // El modelo es dinámico: no hay que cambiar el componente para un banco
    // importado con cuatro respuestas.
    const dos = montar({ question: pregunta({ options: ['a', 'b'], correctIndex: 0 }) })
    expect(dos.findAll('[role="option"]')).toHaveLength(2)

    const cuatro = montar({
      question: pregunta({ options: ['a', 'b', 'c', 'd'], correctIndex: 3 }),
    })
    expect(cuatro.findAll('[role="option"]')).toHaveLength(4)
  })

  it('emite el índice de la opción pulsada', () => {
    const wrapper = montar({ question: pregunta() })

    wrapper.findAll('[role="option"]')[2]?.trigger('click')

    expect(wrapper.emitted('pick')).toEqual([[2]])
  })

  it('no marca ninguna respuesta antes de revelarla', () => {
    // Antes de tiempo todas las opciones deben verse iguales: si una saliera
    // resaltada, la pregunta sería un giveaway.
    const wrapper = montar({ question: pregunta() })

    expect(wrapper.find('.option-correct').exists()).toBe(false)
    expect(wrapper.find('.option-missed').exists()).toBe(false)
    expect(wrapper.find('[aria-selected="true"]').exists()).toBe(false)
  })

  it('resalta la correcta y el fallo solo al revelar', () => {
    const wrapper = montar({ question: pregunta(), revealed: true })
    const opciones = wrapper.findAll('[role="option"]')

    expect(opciones[1]?.classes()).toContain('option-correct')
    expect(opciones[0]?.classes()).toContain('option-missed')
    expect(opciones[2]?.classes()).toContain('option-missed')
  })

  it('desactiva las opciones al revelar para que no se pueda volver a pulsar', () => {
    const wrapper = montar({ question: pregunta(), revealed: true })

    for (const opcion of wrapper.findAll('[role="option"]')) {
      expect(opcion.attributes('disabled')).toBeDefined()
    }
  })

  it('marca la correcta como seleccionada para lectores de pantalla', () => {
    const wrapper = montar({ question: pregunta(), revealed: true })
    const seleccionada = wrapper.findAll('[role="option"]').filter((o) => o.attributes('aria-selected') === 'true')

    expect(seleccionada).toHaveLength(1)
    expect(seleccionada[0]?.text()).toContain('Se registra al devengarlo')
  })

  it('muestra el texto tal cual sin interpretarlo como HTML', () => {
    // Una pregunta importada de un fichero manipulado no puede inyectar
    // etiquetas: Vue escapa la interpolación y aquí no hay ningún `v-html`.
    const wrapper = montar({
      question: pregunta({ options: ['<img src=x onerror=alert(1)>', 'b', 'c'] }),
    })

    expect(wrapper.html()).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('no rompe con un texto vacío', () => {
    // El store nunca entrega una pregunta así, pero el componente no debe
    // lanzar si algún día llegara una.
    const wrapper = montar({ question: pregunta({ options: ['', 'b', ''] }) })

    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
  })

  it('numera con letras A, B, C y D', () => {
    const wrapper = montar({ question: pregunta({ options: ['a', 'b', 'c', 'd'] }) })
    const insignias = wrapper.findAll('[role="option"] span[aria-hidden="true"]')

    expect(insignias.map((i) => i.text())).toEqual(['A', 'B', 'C', 'D'])
  })
})
