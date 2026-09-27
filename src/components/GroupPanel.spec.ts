import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GroupPanel from './GroupPanel.vue'
import type { Group, GroupAnswer } from '@/types'

/** Grupo de ejemplo con la respuesta que se le pase. */
function grupo(id: string, name: string, currentAnswer: number | null = null): Group {
  return { id, name, label: id.toUpperCase(), score: 0, currentAnswer }
}

/** Monta el panel con valores por defecto razonables. */
function montar(props: {
  groups: Group[]
  answers?: GroupAnswer[]
  selectedId?: string | null
  revealed?: boolean
  selectable?: boolean
}) {
  return mount(GroupPanel, {
    props: {
      groups: props.groups,
      selectedId: props.selectedId ?? null,
      answers: props.answers ?? [],
      correctIndex: 1,
      revealed: props.revealed ?? false,
      selectable: props.selectable ?? true,
    },
  })
}

describe('GroupPanel', () => {
  it('lista un botón por grupo en el orden recibido', () => {
    const wrapper = montar({ groups: [grupo('a', 'Los Auditores'), grupo('b', 'Los Contadores')] })
    const botones = wrapper.findAll('button')

    expect(botones).toHaveLength(2)
    expect(botones[0]?.text()).toContain('Los Auditores')
    expect(botones[1]?.text()).toContain('Los Contadores')
  })

  it('muestra letra y nombre en una línea de texto, sin círculo', () => {
    const wrapper = montar({
      groups: [grupo('a', 'Los Auditores'), grupo('b', 'Grupo B')],
    })

    // Con nombre propio se compone "Grupo A — Los Auditores".
    expect(wrapper.text()).toContain('Grupo A — Los Auditores')
    // Sin nombre propio (el store rellena con la designación) no se duplica.
    expect(wrapper.text()).toContain('Grupo B')
    expect(wrapper.text()).not.toContain('Grupo B — Grupo B')
    // El avatar circular era un <span> redondeado: ya no debe quedar ninguno.
    expect(wrapper.findAll('.rounded-full')).toHaveLength(0)
  })

  it('emite el id del grupo al pulsarlo', () => {
    const wrapper = montar({ groups: [grupo('a', 'A'), grupo('b', 'B')] })

    wrapper.findAll('button')[1]?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['b']])
  })

  it('no emite si el panel no admite selección', () => {
    const wrapper = montar({ groups: [grupo('a', 'A')], selectable: false })

    wrapper.find('button').trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('deshabilita el grupo que ya respondió', () => {
    // La respuesta es definitiva: si el botón siguiera activo, un segundo clic
    // podría registrar una respuesta distinta de la que ya ve la sala.
    const wrapper = montar({ groups: [grupo('a', 'A', 1), grupo('b', 'B')] })
    const botones = wrapper.findAll('button')

    expect(botones[0]?.attributes('disabled')).toBeDefined()
    expect(botones[1]?.attributes('disabled')).toBeUndefined()
    expect(botones[0]?.text()).toContain('Ha respondido')
    expect(botones[1]?.text()).toContain('Pendiente')
  })

  it('marca visualmente el grupo seleccionado', () => {
    const wrapper = montar({ groups: [grupo('a', 'A'), grupo('b', 'B')], selectedId: 'b' })
    const botones = wrapper.findAll('button')

    expect(botones[1]?.classes()).toContain('border-gold')
    expect(botones[0]?.classes()).not.toContain('border-gold')
    expect(botones[1]?.attributes('aria-pressed')).toBe('true')
  })

  it('muestra el marcador de cada grupo', () => {
    const a = grupo('a', 'A')
    a.score = 700
    const wrapper = montar({ groups: [a, grupo('b', 'B')] })

    expect(wrapper.text()).toContain('700')
  })

  it('no enseña aciertos ni fallos antes de revelar', () => {
    const wrapper = montar({ groups: [grupo('a', 'A', 1)], answers: [{ groupId: 'a', optionIndex: 1, correct: true, pointsAwarded: 100 }] })

    expect(wrapper.text()).not.toContain('✓')
    expect(wrapper.text()).not.toContain('✗')
  })

  it('enseña el acierto y el fallo al revelar', () => {
    const wrapper = montar({
      groups: [grupo('a', 'A', 1), grupo('b', 'B', 0)],
      answers: [
        { groupId: 'a', optionIndex: 1, correct: true, pointsAwarded: 100 },
        { groupId: 'b', optionIndex: 0, correct: false, pointsAwarded: 0 },
      ],
      revealed: true,
    })

    expect(wrapper.text()).toContain('✓')
    expect(wrapper.text()).toContain('✗')
    // El significado no se transmite solo con el símbolo: un lector de
    // pantalla necesita que se diga en palabras.
    const etiquetas = wrapper.findAll('[aria-label]').map((e) => e.attributes('aria-label'))
    expect(etiquetas).toContain('A acertado')
    expect(etiquetas).toContain('Ha fallado')
  })

  it('funciona con 50 grupos sin fallar', () => {
    // El límite real es 20, pero la lista no debe romperse si se relajara.
    const muchos = Array.from({ length: 50 }, (_, i) => grupo(`g${i}`, `Equipo ${i}`))
    const wrapper = montar({ groups: muchos })

    expect(wrapper.findAll('button')).toHaveLength(50)
  })

  it('se monta con la lista vacía sin error', () => {
    const wrapper = montar({ groups: [] })

    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})
