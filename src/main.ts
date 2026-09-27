// Punto de entrada de la aplicación.
//
// El orden de los imports importa: la fuente se carga antes que los estilos
// para que las reglas de Tailwind que la referencien ya la encuentren, y
// `style.css` se importa sin más para que Vite lo inyecte al compilar.
import '@fontsource-variable/montserrat'
import './style.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'

// Se crea un único Pinia para toda la aplicación: los stores (banco de
// preguntas y partida) comparten ese mismo contexto, y los tests pueden
// sustituirlo por uno nuevo con `createPinia` + `setActivePinia`.
createApp(App).use(createPinia()).mount('#app')
