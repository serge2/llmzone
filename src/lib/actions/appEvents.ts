// src/lib/actions/appEvents.ts
import { openUrl } from '@tauri-apps/plugin-opener';

export function setupGlobalEvents(callbacks: { 
  onContextMenu: (e: MouseEvent, href: string) => void,
  onClickOutside: () => void 
}) {
  const handleClick = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor && /^https?:\/\//.test(anchor.href)) {
      e.preventDefault();
      openUrl(anchor.href);
    }
    callbacks.onClickOutside();
  };

  const handleContextMenu = (e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor) {
      e.preventDefault();
      callbacks.onContextMenu(e, anchor.href);
    }
  };

  document.addEventListener('click', handleClick);
  document.addEventListener('contextmenu', handleContextMenu);

  return () => {
    document.removeEventListener('click', handleClick);
    document.removeEventListener('contextmenu', handleContextMenu);
  };
}
