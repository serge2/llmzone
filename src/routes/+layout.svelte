<script lang="ts">
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  
  // В SvelteKit / Tauri 2 через $props() передается контент текущей страницы
  let { children } = $props();
</script>

<div class="app-container">
  {@render children()}
</div>

<ToastContainer />

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: sans-serif; /* Или ваш шрифт */
    overflow: hidden; /* Обычно для Tauri приложений */
  }

  .app-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
