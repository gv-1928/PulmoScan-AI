import React, { useState, useEffect } from 'react';
import { DeviceConsole } from './console/DeviceConsole.tsx';
import { MobileCompanion } from './mobile/MobileCompanion.tsx';
import { TestHarnessView } from './components/TestHarnessView.tsx';
import { ThemeProvider } from './shared/themeContext.tsx';

function MainRouter() {
  const [currentRoute, setCurrentRoute] = useState<'console' | 'mobile' | 'test'>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/m' || hash.includes('/m')) return 'mobile';
      if (path === '/test' || hash.includes('/test')) return 'test';
    }
    return 'console';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === '/m' || hash.includes('/m')) {
        setCurrentRoute('mobile');
      } else if (path === '/test' || hash.includes('/test')) {
        setCurrentRoute('test');
      } else {
        setCurrentRoute('console');
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const navigateTo = (route: 'console' | 'mobile' | 'test') => {
    setCurrentRoute(route);
    const targetUrl = route === 'mobile' ? '/m' : route === 'test' ? '/test' : '/';
    if (window.history.pushState) {
      window.history.pushState(null, '', targetUrl);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {currentRoute === 'console' && (
        <DeviceConsole
          onOpenTestHarness={() => navigateTo('test')}
          onOpenMobileView={() => navigateTo('mobile')}
        />
      )}

      {currentRoute === 'mobile' && (
        <div className="min-h-screen max-w-md mx-auto bg-white dark:bg-slate-900 shadow-2xl relative">
          <MobileCompanion />
        </div>
      )}

      {currentRoute === 'test' && (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8">
          <TestHarnessView onBack={() => navigateTo('console')} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainRouter />
    </ThemeProvider>
  );
}
