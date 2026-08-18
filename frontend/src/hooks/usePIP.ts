import { useState, useRef, useCallback } from 'react';

export function usePIP() {
  const [isActive, setIsActive] = useState(false);
  const pipWindowRef = useRef<Window | null>(null);

  const open = useCallback(async () => {
    try {
      // @ts-ignore — Document PIP API types not yet in TS lib
      if (!('documentPictureInPicture' in window)) {
        alert('Document Picture-in-Picture is not supported in this browser. Use Chrome 116+.');
        return null;
      }

      // @ts-ignore
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 420,
        height: 140,
      });

      // Inject styles into PIP window
      const styleSheets = document.querySelectorAll('link[rel="stylesheet"], style');
      styleSheets.forEach((sheet) => {
        pipWindow.document.head.appendChild(sheet.cloneNode(true));
      });

      // Add base styles for PIP window
      const style = pipWindow.document.createElement('style');
      style.textContent = `
        body {
          margin: 0;
          padding: 12px;
          background: rgba(9, 13, 22, 0.95);
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          color: white;
          overflow: hidden;
        }
      `;
      pipWindow.document.head.appendChild(style);

      // Create mount point
      const container = pipWindow.document.createElement('div');
      container.id = 'pip-root';
      pipWindow.document.body.appendChild(container);

      pipWindowRef.current = pipWindow;
      setIsActive(true);

      // Handle PIP window close
      pipWindow.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setIsActive(false);
      });

      return pipWindow;
    } catch (err) {
      console.error('PIP error:', err);
      return null;
    }
  }, []);

  const close = useCallback(() => {
    pipWindowRef.current?.close();
    pipWindowRef.current = null;
    setIsActive(false);
  }, []);

  const toggle = useCallback(async () => {
    if (isActive) {
      close();
      return null;
    }
    return open();
  }, [isActive, open, close]);

  return { isActive, pipWindow: pipWindowRef.current, toggle, open, close };
}
