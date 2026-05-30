import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('appTheme') || 'default';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (currentTheme) => {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.remove('dark');
      
      if (currentTheme === 'dark' || (currentTheme === 'default' && systemPrefersDark)) {
        root.classList.add('dark');
      }
    };

    applyTheme(theme);
    localStorage.setItem('appTheme', theme);

    const handleStorageChange = (e) => {
      // Safely handle when localStorage.clear() is called during logout
      if (e.key === 'appTheme') {
        if (e.newValue) {
          setTheme(e.newValue);
        } else {
          setTheme('default');
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    let mediaQuery;
    const handleSystemChange = () => applyTheme(theme);
    
    if (theme === 'default') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', handleSystemChange);
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (mediaQuery) {
        mediaQuery.removeEventListener('change', handleSystemChange);
      }
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);