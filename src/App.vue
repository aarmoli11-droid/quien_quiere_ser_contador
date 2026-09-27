<script setup lang="ts">
/**
 * Componente raíz.
 *
 * Decide qué pantalla se ve a partir de la fase del store, que es la única
 * fuente de verdad del juego. Así no hay un segundo "estado de pantalla" que
 * pueda contradecir a la partida: si la fase es `results`, se ve la tabla de
 * resultados, venga de donde venga.
 */
import { ref } from 'vue'

import GameScreen from '@/components/GameScreen.vue'
import ResultsScreen from '@/components/ResultsScreen.vue'
import SetupScreen from '@/components/SetupScreen.vue'
import StageBackdrop from '@/components/StageBackdrop.vue'
import QuestionAdmin from '@/components/admin/QuestionAdmin.vue'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

/**
 * El panel de preguntas se muestra encima de la pantalla actual en lugar de
 * navegar a otra ruta: el proyecto es una aplicación de una sola página sin
 * router, y así el anfitrión no pierde nada de lo que había escrito.
 *
 * Se abre desde la configuración y, al no depender de la fase, el overlay sigue
 * en su sitio si la partida avanzara por debajo. Editar el banco con un
 * cronómetro corriendo no tiene sentido en un juego presencial, así que
 * deliberadamente no se añade un acceso durante la partida.
 */
const adminAbierto = ref(false)
</script>

<template>
  <StageBackdrop />

  <main class="relative h-full w-full">
    <QuestionAdmin v-if="adminAbierto" @close="adminAbierto = false" />

    <!--
      Durante la partida y en la tabla de resultados el panel de preguntas se
      superpone, así que se ocultan debajo.
    -->
    <template v-else-if="game.phase === 'results'">
      <ResultsScreen @back="game.backToSetup()" />
    </template>

    <GameScreen v-else-if="game.phase !== 'setup'" />

    <SetupScreen v-else @start="game.startGame()" @open-admin="adminAbierto = true" />
  </main>
</template>
