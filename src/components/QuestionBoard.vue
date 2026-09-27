<script setup lang="ts">
/**
 * Tablero de opciones de la pregunta.
 *
 * Muestra 2, 3 o 4 opciones según la pregunta, en la silueta trapezoidal del
 * programa. Todas las opciones se exponen desde el principio: el ocultar y
 * revelar por turnos es una decisión del SOFTWARE original, no del juego, y aquí
 * las respuestas se muestran a la vez para que los grupos puedan debatedlas.
 *
 * Cuando `revealed` pasa a `true`, la opción correcta se pinta de verde y la
 * que eligió el grupo, de rojo. Ningún texto se interpreta como HTML: todo va
 * con `{{ }}`, que Vue escapa, así que una pregunta importada con `<script>` en
 * el texto se muestra literal y no se ejecuta.
 */
import type { ShuffledQuestion } from '@/types'

/** Pregunta ya mezclada, tal y como la entrega el store. */
const props = defineProps<{ question: ShuffledQuestion; revealed: boolean }>()

/** Se emite con el índice (no con la letra) para no depender del orden visual. */
const emit = defineEmits<{ (e: 'pick', index: number): void }>()

/** Letras de las opciones, para la insignia circular de cada una. */
const LETRAS = ['A', 'B', 'C', 'D'] as const

/**
 * Clase de color de una opción.
 *
 * Solo tiene efecto cuando la respuesta ya está revelada: antes de eso, todas
 * las opciones se ven iguales, que es lo que hace que la pregunta sea una
 * pregunta y no un formulario.
 */
function claseDe(index: number): string {
  if (!props.revealed) return ''
  if (index === props.question.correctIndex) return 'option-correct'
  return 'option-missed'
}
</script>

<template>
  <ul class="flex w-full flex-col gap-3" role="listbox" aria-label="Opciones de respuesta">
    <li v-for="(opcion, indice) in question.options" :key="`${indice}-${opcion}`">
      <button
        type="button"
        role="option"
        :aria-selected="revealed && indice === question.correctIndex"
        :disabled="revealed"
        class="option-shape option-button option-enter flex w-full items-center gap-4 px-7 py-4 text-left text-lg font-semibold text-white shadow-lg"
        :class="claseDe(indice)"
        :style="{ animationDelay: `${indice * 70}ms` }"
        @click="emit('pick', indice)"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-black/35 font-extrabold"
          aria-hidden="true"
        >
          {{ LETRAS[indice] ?? indice + 1 }}
        </span>
        <span class="min-w-0 break-words">{{ opcion }}</span>
      </button>
    </li>
  </ul>
</template>
