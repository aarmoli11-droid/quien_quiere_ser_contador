<script setup lang="ts">
/**
 * Gestión del banco de preguntas.
 *
 * Permite añadir, editar, borrar, importar y exportar preguntas. Todo el trabajo
 * real (validación, normalización y persistencia) está en el store y en
 * `questionSchema`; este componente solo recoge lo que se escribe y lo enseña.
 *
 * El formulario trabaja con un borrador en `borrador` y no con la pregunta
 * guardada: así una edición a medias nunca deja la lista a medias.
 */
import { computed, ref } from 'vue'

import { useQuestionBankStore } from '@/stores/questionBank'
import { MAX_OPTION_TEXT, MAX_QUESTION_TEXT } from '@/lib/questionSchema'
import { MAX_OPTIONS, MIN_OPTIONS } from '@/types'
import type { Difficulty, Question } from '@/types'

/** Se emite para cerrar el panel. */
const emit = defineEmits<{ (e: 'close'): void }>()

const bank = useQuestionBankStore()

/** Estado del formulario: `null` significa "creando una nueva". */
const editandoId = ref<string | null>(null)

/** Borrador del formulario, separado de la pregunta guardada. */
const borrador = ref({ text: '', options: ['', '', ''] as string[], correctIndex: 0, difficulty: 'facil' as Difficulty, category: '' })

/** Filtro de texto de la lista. */
const filtro = ref('')

/** Mensaje de resultado de la última acción (import, export, borrado). */
const aviso = ref<string | null>(null)

/** Fichero del `<input type="file">`, pendiente de leer. */
const fichero = ref<File | null>(null)

/** Categorías presentes en el banco, para el selector. */
const categorias = computed(() => {
  const encontradas = new Set<string>()
  for (const pregunta of bank.questions) {
    if (pregunta.category !== undefined) encontradas.add(pregunta.category)
  }
  return [...encontradas].sort()
})

/**
 * Reparto del banco por dificultad.
 *
 * Se enseña porque el selector de dificultad de la configuración no se
 * explica solo: en modo «Difícil» entran todas las preguntas, no solo las
 * difíciles. Con el banco de ejemplo, que solo trae fáciles, elegir «Difícil»
 * juega exactamente igual que «Fácil» y parece un fallo de la aplicación.
 */
const conteoDificultad = computed(() => ({
  facil: bank.byDifficulty('facil').length,
  dificil: bank.byDifficulty('dificil').length,
}))

/** `true` cuando no hay ninguna pregunta difícil que justifique el modo difícil. */
const sinDificiles = computed(() => conteoDificultad.value.dificil === 0)

/** Preguntas que pasan el filtro de texto, sobre el enunciado y las opciones. */
const filtradas = computed(() => {
  const texto = filtro.value.trim().toLowerCase()
  if (texto === '') return bank.questions
  return bank.questions.filter(
    (pregunta) =>
      pregunta.text.toLowerCase().includes(texto) ||
      pregunta.options.some((opcion) => opcion.toLowerCase().includes(texto)),
  )
})

/** Deja el formulario en blanco para crear una pregunta nueva. */
function nueva(): void {
  editandoId.value = null
  borrador.value = {
    text: '',
    options: ['', '', ''],
    correctIndex: 0,
    difficulty: 'facil',
    category: '',
  }
}

/** Carga una pregunta existente en el formulario. */
function editar(pregunta: Question): void {
  editandoId.value = pregunta.id
  borrador.value = {
    text: pregunta.text,
    // Se copian las opciones a un array propio: si no, la edición tocaría la
    // pregunta del store mientras el anfitrión escribe.
    options: [...pregunta.options],
    correctIndex: pregunta.correctIndex,
    difficulty: pregunta.difficulty,
    category: pregunta.category ?? '',
  }
}

/**
 * Añade una opción vacía.
 *
 * Se permite hasta `MAX_OPTIONS`; el mínimo se respeta al validar, no impediendo
 * borrar durante la edición.
 */
function anadirOpcion(): void {
  if (borrador.value.options.length >= MAX_OPTIONS) return
  borrador.value.options = [...borrador.value.options, '']
}

/** Quita la última opción, sin bajar de las que ya tienen texto. */
function quitarOpcion(): void {
  if (borrador.value.options.length <= MIN_OPTIONS) return
  borrador.value.options = borrador.value.options.slice(0, -1)
}

/**
 * Guarda el borrador.
 *
 * Se construye un objeto plano con la misma forma que espera `sanitizeQuestion`,
 * de modo que la validación es la del importador: no hay una segunda vía, más
 * permisiva, para las preguntas escritas a mano.
 *
 * La única diferencia con el importador es la comprobación previa de huecos: al
 * importar, una opción en blanco se descarta porque el archivo puede venir de
 * donde sea, pero en el formulario el anfitrión ha visto tres casillas y espera
 * tres opciones. Guardar en silencio una pregunta de dos sería un cambio que
 * nadie ha pedido, así que se devuelve el error y se le avisa.
 */
function guardar(): void {
  const huecos = borrador.value.options.some((opcion) => opcion.trim() === '')
  if (huecos) {
    aviso.value = 'No se ha podido guardar: todas las opciones necesitan texto. Si sobra una, quítala con «− Opción».'
    return
  }

  const candidato = {
    text: borrador.value.text,
    options: [...borrador.value.options],
    correctIndex: borrador.value.correctIndex,
    difficulty: borrador.value.difficulty,
    category: borrador.value.category,
  }

  const guardada =
    editandoId.value === null
      ? bank.addQuestion(candidato)
      : bank.updateQuestion(editandoId.value, candidato)

  if (guardada === null) {
    aviso.value = 'No se ha podido guardar: revisa el enunciado, las opciones y cuál es la correcta.'
    return
  }
  aviso.value = null
  nueva()
}

/**
 * Exporta el banco a un fichero JSON.
 *
 * La descarga se monta aquí y no en el store: el store no toca el DOM, así que
 * se puede probar sin navegador. El nombre incluye la fecha para que varias
 * copias de seguridad no se pisen entre sí.
 */
function exportar(): void {
  const contenido = bank.exportBank()
  const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `banco-preguntas-${new Date().toISOString().slice(0, 10)}.json`
  enlace.click()
  // El objeto temporal se revoca: si no, el blob se queda retenido en memoria
  // hasta que se recargue la página.
  URL.revokeObjectURL(url)
  aviso.value = `Banco exportado con ${bank.questions.length} pregunta(s).`
}

/**
 * Importa un fichero JSON elegido por el anfitrión.
 *
 * Se pasa el texto tal cual al store, que es quien sabe interpretarlo. El aviso
 * dice cuántas se descartaron: un banco con 3 de 20 preguntas puede haberse
 * quedado corto sin que se note, y conviene que el anfitrión lo sepa. Si el
 * archivo ni siquiera es un JSON, el store explica el motivo: un "importadas 0"
 * sin más sería indistinguible de un banco vacío válido.
 */
async function importar(): Promise<void> {
  const elegido = fichero.value
  if (elegido === null) return

  const texto = await elegido.text()
  const { imported, rejected, error } = bank.importBank(texto)

  if (error !== undefined) {
    aviso.value = `No se ha importado nada: ${error}`
  } else if (rejected === 0) {
    aviso.value = `Importadas ${imported} pregunta(s).`
  } else {
    aviso.value = `Importadas ${imported} pregunta(s); se han descartado ${rejected} por no ser válidas.`
  }

  fichero.value = null
  nueva()
}

/** Vuelve al banco semilla, confirmando antes porque no tiene vuelta atrás. */
function restablecer(): void {
  if (!window.confirm('¿Seguro? Se perderán las preguntas actuales.')) return
  bank.resetToSeed()
  aviso.value = 'Banco restablecido a las preguntas de ejemplo.'
  nueva()
}
</script>

<template>
  <section class="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col gap-5 px-6 py-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-3xl font-extrabold text-gold">Banco de preguntas</h1>
      <button
        type="button"
        class="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold transition hover:border-gold hover:text-gold"
        @click="emit('close')"
      >
        Cerrar
      </button>
    </header>

    <!--
      Aviso de dificultad. Sin él, cambiar el selector de la configuración
      parece no hacer nada mientras el banco no tenga preguntas difíciles, y lo
      razonable es pensar que la aplicación está rota.
    -->
    <div class="flex flex-col gap-1">
      <p class="text-sm text-white/70">
        {{ conteoDificultad.facil }}
        {{ conteoDificultad.facil === 1 ? 'pregunta fácil' : 'preguntas fáciles' }} ·
        {{ conteoDificultad.dificil }}
        {{ conteoDificultad.dificil === 1 ? 'pregunta difícil' : 'preguntas difíciles' }}
      </p>
      <p v-if="sinDificiles" class="text-sm text-amber-bright">
        No hay preguntas difíciles en el banco. El modo «Difícil» usa todas las preguntas, así que
        ahora mismo se juega lo mismo que en «Fácil». Añade alguna difícil para que la diferencia se
        note.
      </p>
    </div>

    <div class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_22rem]">
      <!-- ============================================ lista -->
      <div class="flex min-h-0 flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="filtro"
            type="search"
            placeholder="Buscar en el banco"
            class="min-w-48 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm placeholder:text-white/40 focus:border-gold focus:outline-none"
            aria-label="Buscar preguntas"
          />
          <span class="text-sm text-white/60">{{ filtradas.length }} / {{ bank.questions.length }}</span>
        </div>

        <p v-if="bank.questions.length === 0" class="py-8 text-center text-white/60">
          El banco está vacío. Añade la primera pregunta con el formulario.
        </p>

        <ul v-else class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          <li
            v-for="pregunta in filtradas"
            :key="pregunta.id"
            class="rounded-xl border border-white/10 bg-white/5 p-3"
          >
            <p class="font-semibold">{{ pregunta.text }}</p>
            <ol class="mt-2 flex flex-col gap-1 text-sm">
              <li
                v-for="(_, indice) in pregunta.options"
                :key="indice"
                class="flex items-center gap-2"
                :class="indice === pregunta.correctIndex ? 'text-hit' : 'text-white/70'"
              >
                <span class="font-bold">{{ String.fromCharCode(65 + indice) }}.</span>
                <span class="min-w-0 break-words">{{ pregunta.options[indice] }}</span>
                <span v-if="indice === pregunta.correctIndex" class="text-xs font-bold">(correcta)</span>
              </li>
            </ol>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span class="rounded-full bg-white/10 px-2 py-0.5">
                {{ pregunta.difficulty === 'facil' ? 'Fácil' : 'Difícil' }}
              </span>
              <span v-if="pregunta.category" class="rounded-full bg-white/10 px-2 py-0.5">
                {{ pregunta.category }}
              </span>
              <span class="flex-1" />
              <button
                type="button"
                class="rounded-md border border-white/20 px-2 py-1 transition hover:border-gold hover:text-gold"
                @click="editar(pregunta)"
              >
                Editar
              </button>
              <button
                type="button"
                class="rounded-md border border-white/20 px-2 py-1 transition hover:border-miss hover:text-white"
                :aria-label="`Borrar ${pregunta.text}`"
                @click="bank.deleteQuestion(pregunta.id)"
              >
                Borrar
              </button>
            </div>
          </li>
        </ul>
      </div>

      <!-- ============================================ formulario e import/export -->
      <div class="flex min-h-0 flex-col gap-4 overflow-y-auto">
        <form class="flex flex-col gap-3 rounded-2xl border border-white/15 bg-ink/70 p-4" @submit.prevent="guardar">
          <h2 class="text-lg font-bold text-gold">
            {{ editandoId === null ? 'Nueva pregunta' : 'Editando pregunta' }}
          </h2>

          <label class="flex flex-col gap-1 text-xs text-white/70">
            <span>Enunciado</span>
            <textarea
              v-model="borrador.text"
              rows="3"
              :maxlength="MAX_QUESTION_TEXT"
              class="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none"
            ></textarea>
          </label>

          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 text-xs text-white/70">Opciones (marca la correcta)</legend>
            <div v-for="(_, indice) in borrador.options" :key="indice" class="flex items-center gap-2">
              <input
                v-model="borrador.options[indice]"
                type="radio"
                name="correcta"
                class="size-4 accent-gold"
                :checked="borrador.correctIndex === indice"
                :aria-label="`Marcar la opción ${String.fromCharCode(65 + indice)} como correcta`"
                @change="borrador.correctIndex = indice"
              />
              <span class="w-4 shrink-0 text-sm font-bold">{{ String.fromCharCode(65 + indice) }}</span>
              <input
                v-model="borrador.options[indice]"
                type="text"
                :maxlength="MAX_OPTION_TEXT"
                class="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none"
              />
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-md border border-white/20 px-2 py-1 text-xs transition hover:border-gold hover:text-gold disabled:opacity-40"
                :disabled="borrador.options.length >= MAX_OPTIONS"
                @click="anadirOpcion"
              >
                + Opción
              </button>
              <button
                type="button"
                class="rounded-md border border-white/20 px-2 py-1 text-xs transition hover:border-miss hover:text-white disabled:opacity-40"
                :disabled="borrador.options.length <= MIN_OPTIONS"
                @click="quitarOpcion"
              >
                − Opción
              </button>
            </div>
          </fieldset>

          <div class="flex gap-3">
            <label class="flex flex-1 flex-col gap-1 text-xs text-white/70">
              <span>Dificultad</span>
              <select
                v-model="borrador.difficulty"
                class="rounded-lg border border-white/20 bg-stage-mid px-2 py-1.5 text-sm"
              >
                <option value="facil">Fácil</option>
                <option value="dificil">Difícil</option>
              </select>
            </label>
            <label class="flex flex-1 flex-col gap-1 text-xs text-white/70">
              <span>Categoría</span>
              <input
                v-model="borrador.category"
                type="text"
                list="categorias"
                maxlength="40"
                class="rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm"
              />
              <datalist id="categorias">
                <option v-for="categoria in categorias" :key="categoria" :value="categoria" />
              </datalist>
            </label>
          </div>

          <div class="flex gap-2">
            <button type="submit" class="flex-1 rounded-lg bg-gold px-4 py-2 font-bold text-ink hover:bg-amber-bright">
              Guardar
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/25 px-4 py-2 text-sm transition hover:border-white/50"
              @click="nueva"
            >
              Limpiar
            </button>
          </div>
        </form>

        <div class="flex flex-col gap-2 rounded-2xl border border-white/15 bg-ink/70 p-4">
          <h2 class="text-lg font-bold text-gold">Copia de seguridad</h2>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg border border-white/25 px-3 py-1.5 text-sm transition hover:border-gold hover:text-gold"
              @click="exportar"
            >
              Exportar
            </button>
            <label
              class="cursor-pointer rounded-lg border border-white/25 px-3 py-1.5 text-sm transition hover:border-gold hover:text-gold"
            >
              Importar
              <input
                type="file"
                accept="application/json,.json"
                class="hidden"
                aria-label="Importar preguntas desde un fichero JSON"
                @change="fichero = ($event.target as HTMLInputElement).files?.[0] ?? null"
              />
            </label>
            <button
              type="button"
              class="rounded-lg border border-miss/60 px-3 py-1.5 text-sm transition hover:bg-miss/20"
              @click="restablecer"
            >
              Restablecer
            </button>
          </div>
          <button
            v-if="fichero !== null"
            type="button"
            class="mt-1 rounded-lg bg-white/10 px-3 py-1.5 text-sm transition hover:bg-white/20"
            @click="importar"
          >
            Cargar «{{ fichero.name }}»
          </button>
          <p class="text-xs text-white/60">
            <template v-if="bank.persistWarning">Aviso del almacenamiento: {{ bank.persistWarning }}</template>
          </p>
        </div>

        <p v-if="aviso" class="text-sm text-gold" role="status">{{ aviso }}</p>
      </div>
    </div>
  </section>
</template>
