<script setup lang="ts">
/**
 * Tabla de resultados y desempate.
 *
 * Al terminar la partida muestra la clasificación final. Si hay empate en el
 * primer puesto ofrece la ronda de desempate; si el banco se ha agotado, avisa en
 * lugar de repetir una pregunta ya respondida.
 */
import { computed } from 'vue'

import { groupDisplayName } from '@/lib/groupLabel'
import { useGameStore } from '@/stores/game'

/** Se emite para volver a la configuración. */
const emit = defineEmits<{ (e: 'back'): void }>()

const game = useGameStore()

/** Ganador único, o `null` si la tabla sigue empatada. */
const ganador = computed(() => (game.needsTiebreak ? null : (game.leaders[0] ?? null)))

/** Rótulo del estado de la ronda de desempate. */
const estadoDesempate = computed(() => {
  if (!game.needsTiebreak) return null
  return `Empate entre ${game.leaders.length} grupos. Se juega una pregunta de desempate.`
})
</script>

<template>
  <section
    class="scroll-area relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col gap-6 overflow-y-auto px-6 py-8"
  >
    <header class="text-center">
      <h1 class="text-4xl font-extrabold text-gold">Fin de la partida</h1>
      <p v-if="ganador" class="mt-2 text-2xl font-bold">
        Ganan los {{ groupDisplayName(ganador) }} con {{ ganador.score }} puntos
      </p>
      <p v-else-if="estadoDesempate" class="mt-2 text-xl text-amber-bright" role="status">
        {{ estadoDesempate }}
      </p>
    </header>

    <table class="w-full overflow-hidden rounded-2xl border border-white/15 text-left text-sm shadow-2xl">
      <caption class="sr-only">Clasificación final de los grupos</caption>
      <thead class="bg-stage-mid/60 text-xs tracking-widest text-white/70 uppercase">
        <tr>
          <th scope="col" class="px-4 py-3">Puesto</th>
          <th scope="col" class="px-4 py-3">Grupo</th>
          <th scope="col" class="px-4 py-3 text-right">Puntos</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="fila in game.ranking"
          :key="fila.id"
          class="border-t border-white/10"
          :class="fila.id === game.leaders[0]?.id ? 'bg-gold/15' : 'bg-ink/60'"
        >
          <td class="px-4 py-3 font-bold text-gold tabular-nums">
            {{ fila.rank }}
            <span v-if="fila.tied" class="text-xs font-normal text-white/50">(empate)</span>
          </td>
          <th scope="row" class="px-4 py-3 font-semibold">
            <!-- Igual que en el panel de grupos: letra y nombre en un texto. -->
            {{ groupDisplayName(fila) }}
          </th>
          <td class="px-4 py-3 text-right font-bold tabular-nums">{{ fila.score }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="game.blockingMessage" class="text-center text-sm text-amber-bright" role="alert">
      {{ game.blockingMessage }}
    </p>

    <footer class="mt-auto flex flex-wrap justify-center gap-3 pt-2">
      <button
        v-if="game.needsTiebreak"
        type="button"
        class="rounded-xl bg-amber-bright px-6 py-3 text-lg font-extrabold text-ink transition hover:brightness-110"
        @click="game.startTiebreak()"
      >
        Jugar el desempate
      </button>

      <button
        type="button"
        class="rounded-xl border border-white/30 px-6 py-3 text-lg font-bold transition hover:border-gold hover:text-gold"
        @click="emit('back')"
      >
        Volver a la configuración
      </button>
    </footer>
  </section>
</template>
