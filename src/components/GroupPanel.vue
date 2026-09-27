<script setup lang="ts">
/**
 * Panel lateral de grupos.
 *
 * Aquí el anfitrión elige qué grupo está respondiendo. El flujo es deliberado en
 * dos pasos: primero se elige el grupo y después se pulsa su opción. En un
 * pantalla compartida con veinte personas mirando, un solo clic directo desde
 * la opción equivocada costaría puntos de verdad.
 *
 * Un grupo que ya respondió queda marcado y no se puede volver a seleccionar:
 * su respuesta es definitiva.
 */
import { groupDisplayName } from '@/lib/groupLabel'
import type { Group, GroupAnswer } from '@/types'

/** Grupos de la partida, en el orden en que se registraron. */
const props = defineProps<{
  groups: readonly Group[]
  selectedId: string | null
  /** Respuestas ya reveladas, indexadas por id de grupo. */
  answers: readonly GroupAnswer[]
  correctIndex: number
  /** `true` cuando la respuesta ya se ha mostrado. */
  revealed: boolean
  /** `true` mientras se puede elegir grupo. */
  selectable: boolean
}>()

const emit = defineEmits<{ (e: 'select', id: string): void }>()

/** Respuesta de un grupo concreto, si ya la hay. */
function respuestaDe(id: string): GroupAnswer | undefined {
  return props.answers.find((respuesta) => respuesta.groupId === id)
}

/** Un grupo con respuesta no nula ya no puede volver a elegirse. */
function yaRespondio(grupo: Group): boolean {
  return grupo.currentAnswer !== null
}
</script>

<template>
  <aside class="flex w-full flex-col gap-2" aria-label="Grupos">
    <h2 class="mb-1 text-center text-sm font-bold tracking-widest text-white/60 uppercase">Grupos</h2>

    <button
      v-for="grupo in groups"
      :key="grupo.id"
      type="button"
      class="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition"
      :class="[
        grupo.id === selectedId
          ? 'border-gold bg-gold/20 ring-2 ring-gold/60'
          : yaRespondio(grupo)
            ? 'border-white/10 bg-white/5 opacity-80'
            : 'border-white/20 bg-white/10 hover:border-white/40',
        selectable && !yaRespondio(grupo) ? 'cursor-pointer' : 'cursor-default',
      ]"
      :disabled="!selectable || yaRespondio(grupo)"
      :aria-pressed="grupo.id === selectedId"
      @click="emit('select', grupo.id)"
    >
      <!--
        Nombre del grupo en una sola línea de texto, con la letra dentro:
        "Grupo A" si el grupo no tiene nombre propio y "Grupo A — aarón" si lo
        tiene. Antes era un círculo con la letra aparte, lo que repetía la misma
        información en mayúsculas y empujaba el nombre a otra línea.
      -->
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-sm font-semibold">{{ groupDisplayName(grupo) }}</span>
        <span class="text-xs text-white/60">
          {{ yaRespondio(grupo) ? 'Ha respondido' : 'Pendiente' }}
        </span>
      </span>

      <span class="text-sm font-bold text-gold tabular-nums">{{ grupo.score }}</span>

      <!--
        En la revelación, la insignia muestra si ese grupo acertó. Se usa texto
        ("✓"/"✗") y no un icono SVG para no depender de ninguna librería.
      -->
      <span
        v-if="revealed && respuestaDe(grupo.id)"
        class="text-lg font-bold"
        :class="respuestaDe(grupo.id)?.correct ? 'text-hit' : 'text-miss'"
        :aria-label="respuestaDe(grupo.id)?.correct ? 'A acertado' : 'Ha fallado'"
      >
        {{ respuestaDe(grupo.id)?.correct ? '✓' : '✗' }}
      </span>
    </button>
  </aside>
</template>
