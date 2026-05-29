import { useState, useEffect } from 'react';

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('gpx_theme');
    return stored ? stored === 'dark' : false;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('gpx_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Apply on first render
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isDark, toggleTheme: () => setIsDark(d => !d) };
}
