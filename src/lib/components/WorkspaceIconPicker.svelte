<script lang="ts">
  import { slide } from 'svelte/transition';

  let { value = $bindable('📁'), onSelect } = $props<{
    value: string;
    onSelect: (icon: string) => void;
  }>();

  let isOpen = $state(false);

  function togglePicker(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    isOpen = !isOpen;
  }

  const groups = [
    { name: 'Работа', icons: ['💼', '💻', '⚙️', '📈', '📋', '📁'] },
    { name: 'Кодинг', icons: ['🤖', '🧠', '🧪', '⚡', '🛠️', '📡'] },
    { name: 'Учеба', icons: ['🎓', '📚', '✍️', '📝', '🧠', '💡'] },
    { name: 'Личное', icons: ['🏠', '🎨', '🎬', '🧘', '🌍', '🍕'] }
  ];

  function select(icon: string) {
    value = icon;
    onSelect(icon);
    isOpen = false;
  }
</script>

<div class="icon-picker-container">
  <button 
    class="current-icon-btn" 
    type="button"
    onclick={togglePicker}
  >
    {value}
  </button>

  {#if isOpen}
    <div 
      class="picker-floating-content" 
      transition:slide={{ duration: 200 }}
      role="presentation"
      onmousedown={(e) => e.stopPropagation()}
    >
      <div class="picker-inner-card">
        {#each groups as group}
          <div class="group-label">{group.name}</div>
          <div class="icons-grid">
            {#each group.icons as icon}
              <button 
                type="button"
                class="icon-variant" 
                onclick={(e) => { e.stopPropagation(); select(icon); }}
              >
                {icon}
              </button>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .icon-picker-container { 
    display: inline-block;
    position: relative; /* Чтобы абсолютное позиционирование работало относительно этой точки */
    pointer-events: auto !important;
  }
  
  .current-icon-btn {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.2rem;
  }

  .picker-floating-content {
    /* Теперь это "облако" над списком, оно не двигает соседа-инпута */
    position: absolute;
    top: 42px;
    left: 0;
    width: 240px;
    z-index: 1000;
  }

  .picker-inner-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    padding: 10px;
  }

  .group-label { 
    font-size: 0.7rem; 
    color: #9ca3af; 
    text-transform: uppercase; 
    margin: 8px 4px 4px 4px; 
    font-weight: 700; 
  }

  .icons-grid { 
    display: grid; 
    grid-template-columns: repeat(6, 1fr); 
    gap: 4px; 
  }

  .icon-variant { 
    background: none; 
    border: none; 
    padding: 6px; 
    font-size: 1.1rem; 
    cursor: pointer; 
    border-radius: 6px;
  }

  .icon-variant:hover { background: #f3f4f6; }
</style>