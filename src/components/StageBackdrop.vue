<script setup lang="ts">
/**
 * Fondo del escenario.
 *
 * Reproduce el decorado del programa con CSS puro en lugar de una imagen: el
 * original era un PNG de 1280x720 que se veía borroso en un proyector 1080p y
 * que además no coincidía con el tamaño de la ventana.
 *
 * Los anillos se dibujan con `radial-gradient` apilados y el círculo interior
 * lleva un halo que respira muy despacio, para que la pantalla no quede
 * totalmente estática mientras los grupos piensan.
 */
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none fixed inset-0 overflow-hidden">
    <!--
      El fondo es puramente decorativo: lleva `aria-hidden` para que un lector de
      pantalla no intente leer los degradados como contenido, y
      `pointer-events-none` para que no se coma los clics de las opciones.

      Los comentarios van SIEMPRE dentro de un elemento, nunca antes en la raíz:
      un comentario suelto en la raíz hace que Vue compile el componente como
      fragmento, y entonces el nodo raíz pasa a ser el contenedor vacío en vez
      del `<div>`, que se queda sin clases ni atributos.
    -->
    <!-- Halo del foco central. -->
    <div class="stage-glow absolute left-1/2 top-1/2 size-[130vmin] -translate-x-1/2 -translate-y-1/2"></div>

    <!--
      Anillos concéntricos: cada capa es un círculo sólido del color del anillo
      siguiente, recortado por `mask` en degradado. Así se consigue el degradado
      radial del original sin ningún recurso externo.
    -->
    <div
      class="absolute left-1/2 top-1/2 aspect-square w-[118vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style="
        background:
          radial-gradient(circle at center, #4553d6 0%, #2f3fbe 26%, #1a2a92 48%, #0d1a63 68%, #04082b 84%);
        box-shadow: 0 0 140px 40px rgb(69 83 214 / 35%);
      "
    ></div>

    <!-- Aro exterior fino, el detalle que da la sensación de "escenario". -->
    <div
      class="absolute left-1/2 top-1/2 aspect-square w-[92vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/15"
    ></div>

    <!-- Peana oscura inferior: el suelo donde se apoya la arena. -->
    <div
      class="absolute inset-x-0 bottom-0 h-[18vh]"
      style="background: linear-gradient(to bottom, transparent, var(--color-plinth) 65%)"
    ></div>
  </div>
</template>
