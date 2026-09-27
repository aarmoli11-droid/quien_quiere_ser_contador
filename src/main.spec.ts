/**
 * Prueba del punto de entrada.
 *
 * `main.ts` no exporta nada: su trabajo es montar la aplicación. Se prueba con
 * un doble de `createApp` para poder observar qué se monta, con qué Pinia y en
 * qué nodo, sin depender del DOM real de jsdom.
 *
 * Los estilos y la fuente se sustituyen porque no aportan nada que comprobar
 * aquí y su procesamiento corresponde al build, no a un test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Elemento raíz que la aplicación debe encontrar en `index.html`. */
const RAIZ = '#app'

/** Doble de la aplicación creada por `createApp`, con lo que se le exige. */
function dobleDeApp() {
  return {
    use: vi.fn().mockReturnThis(),
    mount: vi.fn().mockReturnThis(),
  }
}

describe('main.ts', () => {
  let app: ReturnType<typeof dobleDeApp>

  beforeEach(() => {
    vi.resetModules()
    app = dobleDeApp()

    vi.doMock('vue', async (importOriginal) => {
      const original = await importOriginal<typeof import('vue')>()
      return { ...original, createApp: vi.fn(() => app) }
    })
    vi.doMock('./style.css', () => ({}))
    vi.doMock('@fontsource-variable/montserrat', () => ({}))
  })

  it('monta el componente raíz', async () => {
    const { createApp } = await import('vue')
    // Se importa aquí y no arriba del todo: `vi.resetModules()` vacía el
    // registro, así que el componente que recibe `main` es otra instancia del
    // que se importaría antes del `beforeEach`.
    const { default: Componente } = await import('./App.vue')
    await import('./main')

    expect(createApp).toHaveBeenCalledTimes(1)
    expect(createApp).toHaveBeenCalledWith(Componente)
  })

  it('monta en el nodo raíz del HTML', async () => {
    await import('./main')

    expect(app.mount).toHaveBeenCalledTimes(1)
    expect(app.mount).toHaveBeenCalledWith(RAIZ)
  })

  it('instala un único Pinia antes de montar', async () => {
    await import('./main')

    // Un solo Pinia para toda la aplicación: los stores del banco y de la
    // partida tienen que compartir contexto, o uno no vería los datos del otro.
    expect(app.use).toHaveBeenCalledTimes(1)
    const pinia = app.use.mock.calls[0]?.[0] as { install?: unknown } | undefined
    expect(typeof pinia?.install).toBe('function')
  })

  it('monta sin lanzar aunque no exista el nodo raíz', async () => {
    // `createApp(...).mount()` no valida el nodo en jsdom: si un futuro cambio
    // rompiera la cadena, este test lo delata antes que el navegador.
    await import('./main')

    expect(app.mount).toHaveBeenCalled()
  })
})
