/**
 * Prueba de regresión del arranque real de la aplicación.
 *
 * Monta `App` sin tocar el store a mano, con el almacenamiento vacío, que es
 * exactamente lo que ocurre la primera vez que el anfitrión abre el juego.
 */
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useQuestionBankStore } from '@/stores/questionBank'
import App from './App.vue'

describe('arranque en frío', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('la configuración muestra el banco de ejemplo sin preparar nada', () => {
    setActivePinia(createPinia())
    const wrapper = mount(App)

    // Así se lo ve el anfitrión: el número de preguntas jugables de la
    // pantalla de configuración.
    expect(wrapper.text()).toContain('10 preguntas jugables')
  })

  it('el store del banco ya viene con la semilla al crearse', () => {
    setActivePinia(createPinia())

    expect(useQuestionBankStore().count).toBe(10)
  })

  it('la semilla queda guardada para la siguiente visita', () => {
    setActivePinia(createPinia())
    useQuestionBankStore()

    expect(localStorage.getItem('qqsc.banco.v1')).not.toBeNull()
  })
})
