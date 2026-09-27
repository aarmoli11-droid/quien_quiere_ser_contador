import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import StageBackdrop from './StageBackdrop.vue'

describe('StageBackdrop', () => {
  it('se monta sin error', () => {
    const wrapper = mount(StageBackdrop)

    expect(wrapper.exists()).toBe(true)
  })

  it('es decorativo y no se lee en pantalla', () => {
    // Es un fondo de degradados: un lector de pantalla no debe intentar
    // anunciar nada, y sus hijos tampoco.
    const wrapper = mount(StageBackdrop)

    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('no intercepta los clics del juego', () => {
    // `pointer-events-none` es imprescindible: sin él, el fondo se comería
    // los clics de las opciones de respuesta.
    const wrapper = mount(StageBackdrop)

    expect(wrapper.classes()).toContain('pointer-events-none')
  })

  it('ocupa toda la pantalla sin provocar scroll', () => {
    const wrapper = mount(StageBackdrop)

    expect(wrapper.classes()).toContain('fixed')
    expect(wrapper.classes()).toContain('inset-0')
    expect(wrapper.classes()).toContain('overflow-hidden')
  })

  it('dibuja los anillos y la peana con CSS, sin imágenes', () => {
    // No debe haber ni un solo `background-image: url(...)`: el escenario se
    // generan con degradados para que escale a cualquier resolución.
    const wrapper = mount(StageBackdrop)

    expect(wrapper.html()).not.toContain('url(')
    expect(wrapper.html()).toContain('radial-gradient')
  })
})
