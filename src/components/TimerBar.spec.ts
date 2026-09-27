import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import TimerBar from './TimerBar.vue'

/**
 * Reloj falso.
 *
 * Se sustituye `Date.now` para poder adelantar el tiempo sin esperar de verdad:
 * un test que dependa de esperar 30 segundos reales no es un test, es una
 * forma lenta de fallar.
 */
let ahora = 1_000_000

/**
 * Avanza el reloj falso y deja que Vue repinte.
 *
 * El `nextTick` es imprescindible: los temporizadores actualizan referencias
 * fuera del ciclo de eventos de Vue, así que el DOM no se actualiza hasta que
 * se vacía la cola de renderizado.
 */
async function avanzar(ms: number): Promise<void> {
  ahora += ms
  vi.advanceTimersByTime(ms)
  await nextTick()
}

/** Interfaz expuesta por el componente con `defineExpose`. */
interface TimerApi {
  start: () => void
  stop: () => void
  toggle: () => void
}

/** Monta la barra y devuelve el wrapper junto con su API expuesta. */
function montar(seconds = 30) {
  const wrapper = mount(TimerBar, { props: { seconds } })
  return { wrapper, vm: wrapper.vm as unknown as TimerApi }
}

beforeEach(() => {
  ahora = 1_000_000
  vi.useFakeTimers()
  vi.setSystemTime(ahora)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TimerBar', () => {
  it('empieza con los segundos indicados', async () => {
    const { wrapper, vm } = montar(45)

    vm.start()
    await nextTick()

    expect(wrapper.text()).toContain('45s')
  })

  it('descuenta con el paso del tiempo', async () => {
    const { wrapper, vm } = montar(30)

    vm.start()
    await avanzar(5_000)

    expect(wrapper.text()).toContain('25s')
  })

  it('redondea hacia arriba para no mostrar 0 antes de tiempo', async () => {
    // Con 29,4 s restantes debe decir 30: un "0s" con el reloj aún vivo
    // confundiría a la sala.
    const { wrapper, vm } = montar(30)

    vm.start()
    await avanzar(600)

    expect(wrapper.text()).toContain('30s')
  })

  it('llega a cero y avisa una sola vez', async () => {
    const { wrapper, vm } = montar(5)
    vm.start()

    await avanzar(5_000)

    expect(wrapper.text()).toContain('0s')
    expect(wrapper.emitted('expired')).toHaveLength(1)
  })

  it('no vuelve a avisar aunque el reloj siga corriendo', async () => {
    // Un segundo aviso volvería a revelar una partida ya resuelta.
    const { wrapper, vm } = montar(5)
    vm.start()

    await avanzar(5_000)
    await avanzar(5_000)

    expect(wrapper.emitted('expired')).toHaveLength(1)
  })

  it('se pausa y no sigue descontando', async () => {
    const { wrapper, vm } = montar(30)

    vm.start()
    await avanzar(10_000)
    vm.toggle()
    await nextTick()
    await avanzar(10_000)

    expect(wrapper.text()).toContain('20s')
  })

  it('reanuda donde se pausó', async () => {
    const { wrapper, vm } = montar(30)

    vm.start()
    await avanzar(10_000)
    vm.toggle()
    await nextTick()
    await avanzar(5_000)
    vm.toggle()
    await nextTick()
    await avanzar(1_000)

    expect(wrapper.text()).toContain('19s')
  })

  it('ofrece pausar con la cuenta en marcha y reanudar al pausar', async () => {
    const { wrapper, vm } = montar(30)
    await nextTick()

    // Antes de empezar no hay nada que pausar: un botón inactivo confunde.
    expect(wrapper.text()).not.toContain('Pausar')
    expect(wrapper.text()).not.toContain('Reanudar')

    vm.start()
    await avanzar(1_000)
    await nextTick()
    expect(wrapper.text()).toContain('Pausar')
    expect(wrapper.text()).not.toContain('Reanudar')

    vm.toggle()
    await nextTick()
    expect(wrapper.text()).toContain('Reanudar')
    expect(wrapper.text()).not.toContain('Pausar')
  })

  it('el botón de la barra pausa de verdad el reloj', async () => {
    const { wrapper, vm } = montar(30)
    vm.start()
    await avanzar(10_000)
    await nextTick()

    await wrapper.findAll('button').find((b) => b.text() === 'Pausar')?.trigger('click')
    await nextTick()
    await avanzar(10_000)

    expect(wrapper.text()).toContain('20s')

    await wrapper.findAll('button').find((b) => b.text() === 'Reanudar')?.trigger('click')
    await nextTick()
    await avanzar(1_000)

    expect(wrapper.text()).toContain('19s')
  })

  it('retira el botón cuando la pregunta termina', async () => {
    const { wrapper, vm } = montar(30)
    vm.start()
    await avanzar(1_000)
    await nextTick()
    expect(wrapper.text()).toContain('Pausar')

    vm.stop()
    await nextTick()

    expect(wrapper.text()).not.toContain('Pausar')
    expect(wrapper.text()).not.toContain('Reanudar')
  })

  it('stop corta la cuenta y vuelve al total', async () => {
    const { wrapper, vm } = montar(30)

    vm.start()
    await avanzar(20_000)
    vm.stop()
    await nextTick()

    expect(wrapper.text()).toContain('30s')
  })

  it('start de nuevo reinicia la cuenta desde el principio', async () => {
    // Es lo que hace falta al pasar a la pregunta siguiente: no puede quedar
    // ningún resto de la anterior.
    const { wrapper, vm } = montar(30)

    vm.start()
    await avanzar(25_000)
    vm.start()
    await nextTick()

    expect(wrapper.text()).toContain('30s')
  })

  it('la barra se vacía al agotarse el tiempo', async () => {
    const { wrapper, vm } = montar(10)
    const barra = () => wrapper.find('.origin-left')

    vm.start()
    await nextTick()
    expect(barra().attributes('style')).toContain('scaleX(1)')

    await avanzar(10_000)
    expect(barra().attributes('style')).toContain('scaleX(0)')
  })

  it('pinta la barra de rojo en los últimos segundos', async () => {
    const { wrapper, vm } = montar(10)

    vm.start()
    await avanzar(6_000)

    expect(wrapper.find('.origin-left').classes()).toContain('bg-miss')
  })

  it('acepta un número de segundos inválido sin romperse', async () => {
    // El store ya sanea los valores, pero el componente no debe mostrar `NaN`
    // aunque se le pase algo raro.
    const { wrapper } = montar(Number.NaN)
    await nextTick()

    expect(wrapper.text()).toContain('30s')
  })

  it('el botón de reanudar devuelve el reloj al hilo', async () => {
    const { wrapper, vm } = montar(30)
    vm.start()
    await avanzar(5_000)
    vm.toggle()
    await nextTick()

    const boton = wrapper.findAll('button').find((b) => b.text() === 'Reanudar')
    await boton?.trigger('click')
    await avanzar(5_000)

    expect(wrapper.text()).toContain('20s')
  })
})
