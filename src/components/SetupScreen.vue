<script setup lang="ts">
/**
 * Pantalla de configuración: equipos y ajustes de la partida.
 *
 * Es la pantalla de la que arranca todo. El anfitrión da de alta a los grupos
 * (con nombre y etiqueta) y ajusta cuánto dura la partida, cuánto vale cada
 * pregunta y qué dificultad se usa en el desempate.
 */
import { computed, ref } from 'vue'

import { unlockAudio } from '@/audio/sfx'
import { MAX_GROUPS, useGameStore } from '@/stores/game'
import { useQuestionBankStore } from '@/stores/questionBank'
import type { Difficulty } from '@/types'

/** Se emite para que el componente raíz decida qué pantalla mostrar. */
const emit = defineEmits<{ (e: 'start'): void; (e: 'open-admin'): void }>()

const game = useGameStore()
const bank = useQuestionBankStore()

/** Campos del formulario de alta de grupo, antes de tocar el store. */
const nuevoNombre = ref('')
const nuevaEtiqueta = ref('')

/** Dificultades disponibles, para los dos selectores. */
const DIFICULTADES: ReadonlyArray<{ value: Difficulty; texto: string }> = [
  { value: 'facil', texto: 'Fácil' },
  { value: 'dificil', texto: 'Difícil' },
]

/** Resumen del banco para que el anfitrión sepa si habrá preguntas suficientes. */
const resumenBanco = computed(() => {
  const total = bank.questions.length
  if (total === 0) return 'El banco está vacío: no se puede jugar.'
  const jugables = bank.playable.length
  return `${jugables} pregunta${jugables === 1 ? '' : 's'} jugable${jugables === 1 ? '' : 's'} de ${total}.`
})

/** Añade el grupo del formulario y deja los campos limpios para el siguiente. */
function añadirGrupo(): void {
  const creado = game.addGroup(nuevoNombre.value, nuevaEtiqueta.value || undefined)
  if (creado === null) return
  nuevoNombre.value = ''
  nuevaEtiqueta.value = ''
}

/** Emite el evento de inicio solo si el store permite empezar. */
function empezar(): void {
  if (!game.canStart) return
  // El navegador no deja reproducir audio hasta que el usuario ha interactuado
  // con la página. Este es el primer clic real de la partida, así que es el
  // momento de desbloquear el audio: si no, el primer sonido se perdería.
  unlockAudio()
  emit('start')
}
</script>

<template>
  <section class="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col gap-6 overflow-y-auto px-6 py-8">
    <header class="text-center">
      <h1 class="text-4xl font-extrabold tracking-wide text-gold drop-shadow-[0_2px_10px_rgb(0_0_0/60%)]">
        QUIÉN QUIERE SER CONTADOR
      </h1>
      <p class="mt-2 text-sm text-white/70">Configura los grupos y la partida antes de empezar.</p>
    </header>

    <div class="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <!-- ============================================ grupos -->
      <div class="rounded-2xl border border-white/15 bg-ink/70 p-5 shadow-2xl backdrop-blur-sm">
        <div class="mb-4 flex items-baseline justify-between">
          <h2 class="text-xl font-bold text-gold">Grupos</h2>
          <span class="text-sm text-white/60">{{ game.groups.length }} / {{ MAX_GROUPS }}</span>
        </div>

        <form class="mb-4 flex flex-wrap gap-2" @submit.prevent="añadirGrupo">
          <input
            v-model="nuevoNombre"
            type="text"
            maxlength="40"
            placeholder="Nombre del grupo (opcional)"
            class="min-w-40 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-white/40 focus:border-gold focus:outline-none"
            aria-label="Nombre del grupo"
          />
          <input
            v-model="nuevaEtiqueta"
            type="text"
            maxlength="8"
            placeholder="Etiqueta"
            class="w-24 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-white/40 focus:border-gold focus:outline-none"
            aria-label="Etiqueta del grupo"
          />
          <button
            type="submit"
            class="rounded-lg bg-gold px-4 py-2 font-bold text-ink transition hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="game.groups.length >= MAX_GROUPS"
          >
            Añadir
          </button>
        </form>

        <p v-if="game.groups.length === 0" class="py-6 text-center text-white/50">
          Todavía no hay grupos. Añade al menos dos para competir.
        </p>

        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="grupo in game.groups"
            :key="grupo.id"
            class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
          >
            <span
              class="flex size-9 shrink-0 items-center justify-center rounded-full bg-stage-core font-bold text-white"
            >
              {{ grupo.label }}
            </span>
            <span class="flex-1 truncate font-semibold">{{ grupo.name }}</span>
            <button
              type="button"
              class="rounded-md border border-white/20 px-2 py-1 text-xs text-white/70 transition hover:border-miss hover:text-white"
              :aria-label="`Quitar ${grupo.name}`"
              @click="game.removeGroup(grupo.id)"
            >
              Quitar
            </button>
          </li>
        </ul>
      </div>

      <!-- ============================================ ajustes -->
      <div class="flex flex-col gap-6">
        <div class="rounded-2xl border border-white/15 bg-ink/70 p-5 shadow-2xl backdrop-blur-sm">
          <h2 class="mb-4 text-xl font-bold text-gold">Partida</h2>

          <div class="flex flex-col gap-3">
            <label class="flex items-center justify-between gap-4 text-sm">
              <span>Dificultad</span>
              <select
                :value="game.difficulty"
                class="w-32 rounded-lg border border-white/20 bg-stage-mid px-2 py-1.5"
                @change="game.updateConfig({ difficulty: ($event.target as HTMLSelectElement).value as Difficulty })"
              >
                <option v-for="d in DIFICULTADES" :key="d.value" :value="d.value">{{ d.texto }}</option>
              </select>
            </label>

            <label class="flex items-center justify-between gap-4 text-sm">
              <span>Número de preguntas</span>
              <input
                type="number"
                min="1"
                :value="game.questionCount"
                class="w-32 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-right"
                @change="game.updateConfig({ questionCount: Number(($event.target as HTMLInputElement).value) })"
              />
            </label>

            <label class="flex items-center justify-between gap-4 text-sm">
              <span>Segundos por pregunta</span>
              <input
                type="number"
                min="1"
                :value="game.secondsPerQuestion"
                class="w-32 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-right"
                @change="game.updateConfig({ secondsPerQuestion: Number(($event.target as HTMLInputElement).value) })"
              />
            </label>

            <label class="flex items-center justify-between gap-4 text-sm">
              <span>Puntos de la primera</span>
              <input
                type="number"
                min="0"
                :value="game.basePoints"
                class="w-32 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-right"
                @change="game.updateConfig({ basePoints: Number(($event.target as HTMLInputElement).value) })"
              />
            </label>

            <label class="flex items-center justify-between gap-4 text-sm">
              <span>Incremento por pregunta</span>
              <input
                type="number"
                min="0"
                :value="game.pointsStep"
                class="w-32 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-right"
                @change="game.updateConfig({ pointsStep: Number(($event.target as HTMLInputElement).value) })"
              />
            </label>

            <label class="flex items-center justify-between gap-4 text-sm">
              <span>Desempate</span>
              <select
                :value="game.tiebreakDifficulty"
                class="w-32 rounded-lg border border-white/20 bg-stage-mid px-2 py-1.5"
                @change="
                  game.updateConfig({ tiebreakDifficulty: ($event.target as HTMLSelectElement).value as Difficulty })
                "
              >
                <option v-for="d in DIFICULTADES" :key="d.value" :value="d.value">{{ d.texto }}</option>
              </select>
            </label>
          </div>

          <p class="mt-4 text-xs text-white/60">
            Escalera de puntos:
            <span class="font-semibold text-gold">{{ game.basePoints }}</span>,
            {{ game.basePoints + game.pointsStep }},
            {{ game.basePoints + game.pointsStep * 2 }}…
          </p>
        </div>

        <div class="rounded-2xl border border-white/15 bg-ink/70 p-5 shadow-2xl backdrop-blur-sm">
          <h2 class="mb-2 text-lg font-bold text-gold">Banco de preguntas</h2>
          <p class="mb-3 text-sm text-white/70">{{ resumenBanco }}</p>
          <button
            type="button"
            class="w-full rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold transition hover:border-gold hover:text-gold"
            @click="emit('open-admin')"
          >
            Gestionar preguntas
          </button>
        </div>
      </div>
    </div>

    <footer class="mt-auto flex flex-col items-center gap-2 pt-2">
      <button
        type="button"
        class="w-full max-w-md rounded-xl bg-gold px-6 py-4 text-lg font-extrabold text-ink shadow-lg transition hover:bg-amber-bright disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!game.canStart"
        @click="empezar"
      >
        Iniciar partida
      </button>
      <p v-if="game.startBlockedReason" class="text-sm text-amber-bright" role="status">
        {{ game.startBlockedReason }}
      </p>
    </footer>
  </section>
</template>
