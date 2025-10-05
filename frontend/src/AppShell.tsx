// frontend/src/AppShell.tsx
import React from 'react';
import { useMediaQuery } from 'react-responsive';
import DualTranslator from './components/Dashboard/DualTranslator';
import DashboardTablet from './components/Dashboard/DashboardTablet';  
import DashboardMobile from './components/Dashboard/DashboardMobile';

function AppShell() {
  const isDesktop = useMediaQuery({ minWidth: 1025 });
  const isTablet = useMediaQuery({ minWidth: 768, maxWidth: 1024 });
  
  // Временно для теста - на десктопе показываем DualTranslator
  if (isDesktop) return <DualTranslator />;
  if (isTablet) return <DashboardTablet />;
  return <DashboardMobile />;
}

export default AppShell;

