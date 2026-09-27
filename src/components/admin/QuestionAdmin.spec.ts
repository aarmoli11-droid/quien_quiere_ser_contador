import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { MAX_OPTIONS, MIN_OPTIONS } from '@/types'
import type { Question } from '@/types'
import { useQuestionBankStore } from '@/stores/questionBank'
import QuestionAdmin from './QuestionAdmin.vue'

/** Dos preguntas conocidas, con una opción reconocible para probar el filtro. */
const BANCO: Question[] = [
  {
    id: 'q-actividades',
    text: '¿Cuáles son las actividades económicas básicas?',
    options: ['La agricultura', 'La pesca', 'La minería'],
    correctIndex: 0,
    difficulty: 'facil',
    category: 'Sector primario',
  },
  {
    id: 'q-iva',
    text: '¿Qué impuesto se añade al Consumidor Final?',
    options: ['El IVA', 'El IRPF'],
    correctIndex: 0,
    difficulty: 'dificil',
    category: 'Fiscalidad',
  },
]

/** Monta el panel sobre un banco con el contenido de `BANCO`. */
function montar(banco: unknown = BANCO) {
  setActivePinia(createPinia())
  useQuestionBankStore().importBank(banco)
  return mount(QuestionAdmin)
}

/** Rellena el formulario con una pregunta válida. */
async function rellenarFormulario(
  wrapper: ReturnType<typeof montar>,
  opciones: string[] = ['Correcta', 'Incorrecta 1', 'Incorrecta 2'],
) {
  await wrapper.find('textarea').setValue('Enunciado de prueba')
  const campos = wrapper.findAll('fieldset input[type="text"]')
  for (const [indice, texto] of opciones.entries()) {
    await campos[indice]?.setValue(texto)
  }
}

describe('QuestionAdmin', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listado', () => {
    it('lista las preguntas del banco', () => {
      const wrapper = montar()

      expect(wrapper.findAll('ul > li')).toHaveLength(2)
      expect(wrapper.text()).toContain('¿Qué impuesto se añade al Consumidor Final?')
    })

    it('indica cuántas preguntas se ven de las totales', () => {
      const wrapper = montar()

      expect(wrapper.text()).toContain('2 / 2')
    })

    it('marca la opción correcta de cada pregunta', () => {
      const wrapper = montar()

      // Las dos tienen la correcta en la posición A.
      expect(wrapper.findAll('li .text-hit')).toHaveLength(2)
      expect(wrapper.text()).toContain('(correcta)')
    })

    it('traduce la dificultad a etiquetas legibles', () => {
      const wrapper = montar()

      expect(wrapper.text()).toContain('Fácil')
      expect(wrapper.text()).toContain('Difícil')
    })

    it('cuenta las preguntas de cada dificultad', () => {
      const wrapper = montar()

      expect(wrapper.text()).toContain('1 pregunta fácil')
      expect(wrapper.text()).toContain('1 pregunta difícil')
      // Con una difícil en el banco no hay nada que avisar.
      expect(wrapper.text()).not.toContain('No hay preguntas difíciles')
    })

    it('avisa de que no hay preguntas difíciles', () => {
      // El banco de ejemplo solo trae fáciles, así que elegir «Difícil» en la
      // configuración juega igual que «Fácil». Sin este aviso parecía un fallo.
      const wrapper = montar([{ ...BANCO[0] }])

      expect(wrapper.text()).toContain('0 preguntas difíciles')
      expect(wrapper.text()).toContain('juega lo mismo que en «Fácil»')
    })

    it('usa el singular con una sola pregunta difícil', () => {
      const wrapper = montar([{ ...BANCO[0] }, { ...BANCO[1] }])

      expect(wrapper.text()).toContain('1 pregunta fácil · 1 pregunta difícil')
    })

    it('avisa cuando el banco está vacío', () => {
      const wrapper = montar([])

      expect(wrapper.text()).toContain('El banco está vacío')
    })
  })

  describe('filtro', () => {
    it('filtra por el enunciado', async () => {
      const wrapper = montar()

      await wrapper.find('input[type="search"]').setValue('Consumidor')

      expect(wrapper.findAll('ul > li')).toHaveLength(1)
      expect(wrapper.text()).toContain('1 / 2')
    })

    it('filtra también por el texto de las opciones', async () => {
      const wrapper = montar()

      await wrapper.find('input[type="search"]').setValue('agricultura')

      expect(wrapper.findAll('ul > li')).toHaveLength(1)
      expect(wrapper.text()).toContain('agricultura')
    })

    it('ignora mayúsculas y espacios al filtrar', async () => {
      const wrapper = montar()

      await wrapper.find('input[type="search"]').setValue('  CONSUMIDOR  ')

      expect(wrapper.findAll('ul > li')).toHaveLength(1)
    })

    it('deja la lista vacía si nada coincide', async () => {
      const wrapper = montar()

      await wrapper.find('input[type="search"]').setValue('xyz abc')

      expect(wrapper.findAll('ul > li')).toHaveLength(0)
      expect(wrapper.text()).toContain('0 / 2')
    })
  })

  describe('alta de preguntas', () => {
    it('guarda una pregunta nueva y limpia el formulario', async () => {
      const wrapper = montar()
      await rellenarFormulario(wrapper)

      await wrapper.find('form').trigger('submit')

      const bank = useQuestionBankStore()
      expect(bank.questions).toHaveLength(3)
      expect(bank.questions[2]?.text).toBe('Enunciado de prueba')
      expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
      expect(wrapper.find('h2').text()).toBe('Nueva pregunta')
    })

    it('avisa y no guarda si falta el enunciado', async () => {
      const wrapper = montar()
      await rellenarFormulario(wrapper)
      await wrapper.find('textarea').setValue('   ')

      await wrapper.find('form').trigger('submit')

      expect(useQuestionBankStore().questions).toHaveLength(2)
      expect(wrapper.find('[role="status"]').text()).toContain('No se ha podido guardar')
    })

    it('avisa si una opción se queda en blanco', async () => {
      const wrapper = montar()
      await rellenarFormulario(wrapper, ['Correcta', '', 'Otra'])

      await wrapper.find('form').trigger('submit')

      expect(useQuestionBankStore().questions).toHaveLength(2)
      expect(wrapper.find('[role="status"]').text()).toContain('No se ha podido guardar')
    })

    it('respeta la opción marcada como correcta', async () => {
      const wrapper = montar()
      await rellenarFormulario(wrapper)

      // Se marca la segunda opción como correcta.
      await wrapper.findAll('fieldset input[type="radio"]')[1]?.setValue(true)
      await wrapper.find('form').trigger('submit')

      expect(useQuestionBankStore().questions[2]?.correctIndex).toBe(1)
    })

    it('añade una cuarta opción', async () => {
      const wrapper = montar()
      await rellenarFormulario(wrapper)

      await wrapper.findAll('button').find((b) => b.text() === '+ Opción')?.trigger('click')
      expect(wrapper.findAll('fieldset input[type="text"]')).toHaveLength(4)

      await wrapper.findAll('fieldset input[type="text"]')[3]?.setValue('Cuarta')
      await wrapper.find('form').trigger('submit')

      expect(useQuestionBankStore().questions[2]?.options).toEqual([
        'Correcta',
        'Incorrecta 1',
        'Incorrecta 2',
        'Cuarta',
      ])
    })

    it('no deja añadir más opciones de las permitidas', async () => {
      const wrapper = montar()
      const boton = (texto: string) => wrapper.findAll('button').find((b) => b.text() === texto)

      for (let i = 0; i < MAX_OPTIONS; i += 1) {
        await boton('+ Opción')?.trigger('click')
      }
      await boton('+ Opción')?.trigger('click')

      expect(wrapper.findAll('fieldset input[type="text"]')).toHaveLength(MAX_OPTIONS)
      expect(boton('+ Opción')?.attributes('disabled')).toBeDefined()
    })

    it('no deja quitar más de las opciones mínimas', async () => {
      const wrapper = montar()
      const boton = wrapper.findAll('button').find((b) => b.text() === '− Opción')

      for (let i = 0; i < MIN_OPTIONS; i += 1) {
        await boton?.trigger('click')
      }

      expect(wrapper.findAll('fieldset input[type="text"]')).toHaveLength(MIN_OPTIONS)
      expect(boton?.attributes('disabled')).toBeDefined()
    })
  })

  describe('edición', () => {
    it('carga la pregunta en el formulario', async () => {
      const wrapper = montar()
      const editar = wrapper.findAll('button').filter((b) => b.text() === 'Editar')[1]
      await editar?.trigger('click')

      expect(wrapper.findAll('h2')[0]?.text()).toBe('Editando pregunta')
      expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('Consumidor')
    })

    it('no modifica el banco mientras se escribe', async () => {
      const wrapper = montar()
      const bank = useQuestionBankStore()
      const original = bank.questions[0]?.text

      await wrapper.findAll('button').filter((b) => b.text() === 'Editar')[0]?.trigger('click')
      await wrapper.find('textarea').setValue('Texto a medias que no se guarda')

      // El borrador es independiente: una edición abandonada no debe corromper
      // lo que hay guardado.
      expect(bank.questions[0]?.text).toBe(original)
    })

    it('guarda los cambios de una pregunta existente', async () => {
      const wrapper = montar()
      const bank = useQuestionBankStore()

      await wrapper.findAll('button').filter((b) => b.text() === 'Editar')[0]?.trigger('click')
      await wrapper.find('textarea').setValue('Enunciado corregido')
      await wrapper.find('form').trigger('submit')

      expect(bank.questions).toHaveLength(2)
      expect(bank.questions[0]?.text).toBe('Enunciado corregido')
      expect(wrapper.findAll('h2')[0]?.text()).toBe('Nueva pregunta')
    })

    it('descarta los cambios al limpiar', async () => {
      const wrapper = montar()

      await wrapper.findAll('button').filter((b) => b.text() === 'Editar')[0]?.trigger('click')
      await wrapper.find('textarea').setValue('Basura')
      await wrapper.findAll('button').find((b) => b.text() === 'Limpiar')?.trigger('click')

      expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
      expect(wrapper.findAll('h2')[0]?.text()).toBe('Nueva pregunta')
    })
  })

  describe('borrado', () => {
    it('borra la pregunta indicada', async () => {
      const wrapper = montar()

      await wrapper.find('button[aria-label="Borrar ¿Cuáles son las actividades económicas básicas?"]').trigger('click')

      const bank = useQuestionBankStore()
      expect(bank.questions).toHaveLength(1)
      expect(bank.questions[0]?.id).toBe('q-iva')
    })
  })

  describe('importación y exportación', () => {
    it('exporta el banco y libera el blob', async () => {
      const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:banco')
      const revocar = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
      const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const wrapper = montar()

      await wrapper.findAll('button').find((b) => b.text() === 'Exportar')?.trigger('click')

      expect(crear).toHaveBeenCalledTimes(1)
      // Sin revocar, el blob se queda retenido en memoria hasta recargar.
      expect(revocar).toHaveBeenCalledWith('blob:banco')
      expect(clic).toHaveBeenCalledTimes(1)
      expect(wrapper.find('[role="status"]').text()).toContain('Banco exportado con 2 pregunta(s)')
    })

    it('importa un fichero JSON válido', async () => {
      const wrapper = montar([])
      const nuevo = {
        questions: [
          { text: 'Nueva importada', options: ['a', 'b', 'c'], correctIndex: 1, difficulty: 'media' },
        ],
      }
      const fichero = new File([JSON.stringify(nuevo)], 'banco.json', { type: 'application/json' })
      const entrada = wrapper.find('input[type="file"]')
      Object.defineProperty(entrada.element, 'files', { value: [fichero], configurable: true })
      await entrada.trigger('change')

      await wrapper.findAll('button').find((b) => b.text().includes('banco.json'))?.trigger('click')
      await flushPromises()

      const bank = useQuestionBankStore()
      expect(bank.questions).toHaveLength(1)
      expect(bank.questions[0]?.text).toBe('Nueva importada')
      expect(wrapper.find('[role="status"]').text()).toContain('Importadas 1 pregunta(s)')
    })

    it('informa de las preguntas descartadas al importar', async () => {
      const wrapper = montar([])
      const mezcla = {
        questions: [
          { text: 'Buena', options: ['a', 'b', 'c'], correctIndex: 0 },
          { text: 'Sin opciones', options: [], correctIndex: 0 },
          'no soy una pregunta',
        ],
      }
      const fichero = new File([JSON.stringify(mezcla)], 'banco.json', { type: 'application/json' })
      const entrada = wrapper.find('input[type="file"]')
      Object.defineProperty(entrada.element, 'files', { value: [fichero], configurable: true })
      await entrada.trigger('change')

      await wrapper.findAll('button').find((b) => b.text().includes('banco.json'))?.trigger('click')
      await flushPromises()

      // Un banco que se queda corto sin avisar sería el peor fallo posible aquí.
      expect(wrapper.find('[role="status"]').text()).toContain('se han descartado 2')
    })

    it('explica por qué no se ha importado si el archivo no es un JSON', async () => {
      const wrapper = montar(BANCO)
      const fichero = new File(['esto no es un banco'], 'roto.json', { type: 'application/json' })
      const entrada = wrapper.find('input[type="file"]')
      Object.defineProperty(entrada.element, 'files', { value: [fichero], configurable: true })
      await entrada.trigger('change')

      await wrapper.findAll('button').find((b) => b.text().includes('roto.json'))?.trigger('click')
      await flushPromises()

      // Un "importadas 0" a secas dejaría al anfitrión sin saber si ha cargado
      // mal el fichero o si el archivo venía vacío.
      expect(wrapper.find('[role="status"]').text()).toContain('no es un JSON válido')
    })

    it('restablece el banco semilla al confirmar', async () => {
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const wrapper = montar([])

      await wrapper.findAll('button').find((b) => b.text() === 'Restablecer')?.trigger('click')

      expect(confirmar).toHaveBeenCalledTimes(1)
      expect(useQuestionBankStore().questions.length).toBeGreaterThan(0)
      expect(wrapper.find('[role="status"]').text()).toContain('restablecido')
    })

    it('no toca el banco si se cancela el restablecimiento', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = montar([])

      await wrapper.findAll('button').find((b) => b.text() === 'Restablecer')?.trigger('click')

      expect(useQuestionBankStore().questions).toHaveLength(0)
    })
  })

  describe('varios', () => {
    it('emite close al cerrar', async () => {
      const wrapper = montar()

      await wrapper.findAll('button').find((b) => b.text() === 'Cerrar')?.trigger('click')

      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('enseña el aviso del almacenamiento si no se puede guardar', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('almacenamiento lleno')
      })
      const wrapper = montar()
      await rellenarFormulario(wrapper)

      await wrapper.find('form').trigger('submit')
      await nextTick()

      expect(wrapper.text()).toContain('Aviso del almacenamiento')
    })
  })
})
