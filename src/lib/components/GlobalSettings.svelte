<script lang="ts">
  import { setLocale } from '$paraglide/runtime';
  import * as m from '$paraglide/messages';

  let {currentLocale, onSave, onClose }: { 
    currentLocale: string, // ПРИНИМАЕМ СНАРУЖИ
    onSave: () => void,
    onClose: () => void 
  } = $props();

  // Создаем зависимость для всех m. ключей внутри этого файла
  const _i18n = $derived(currentLocale);

  function handleLanguageChange(e: Event) {
    const newLang = (e.target as HTMLSelectElement).value as 'en' | 'ru' | 'uk' | 'de';
    
    // 1. Сначала меняем локаль в рантайме
    setLocale(newLang, { reload: false });
    
    // 2. Вызываем сохранение. 
    // В +page.svelte функция persistConfig обновит currentLocaleState, 
    // и этот компонент (и все остальные) мгновенно перерисуется.
    onSave();
  }
</script>

<div class="settings-overlay">
  <div class="settings-container">
    <header class="settings-header">
      <button class="back-btn" onclick={onClose}>
        {_i18n && m.settings_back()}
      </button>
      <h2>{_i18n && m.settings_title()}</h2>
    </header>

    <div class="settings-form">
      <div class="setting-item">
        <label for="languageSelect">{_i18n && m.settings_label_language()}</label>
        <select 
          id="languageSelect"
          value={currentLocale} 
          onchange={handleLanguageChange}
          class="settings-select"
        >
          <option value="en">English</option>
          <option value="ru">Русский</option>
          <option value="uk">Українська</option>
          <option value="de">Deutsch</option>
        </select>
      </div>
      
      <div class="footer-info">
        <p>{_i18n && m.settings_footer_info()}</p>
      </div>
    </div>
  </div>
</div>

<style>
  /* Стили без изменений */
  .settings-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: #ffffff;
    z-index: 1000;
    display: flex;
    justify-content: center;
    overflow-y: auto;
  }

  .settings-container {
    width: 100%;
    max-width: 800px;
    padding: 60px 20px;
  }

  .settings-header {
    margin-bottom: 40px;
  }

  .back-btn {
    background: none;
    border: none;
    color: #5865f2;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 0;
    margin-bottom: 16px;
  }

  h2 { margin: 0; font-size: 1.8rem; font-weight: 700; }

  .settings-form {
    display: flex;
    flex-direction: column;
    gap: 24px;
    background: #f9fafb;
    padding: 32px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
  }

  .setting-item { display: flex; flex-direction: column; gap: 8px; }
  
  .setting-item label {
    font-size: 0.85rem;
    font-weight: 700;
    color: #4b5563;
    text-transform: uppercase;
  }

  .footer-info {
    margin-top: 12px;
    font-size: 0.85rem;
    color: #6b7280;
    line-height: 1.5;
  }
</style>
