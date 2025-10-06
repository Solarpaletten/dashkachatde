// frontend/src/AppShell.tsx
import React from 'react';
import DualTranslator from './components/Dashboard/DualTranslator';

function AppShell() {
  // Убрать все проверки ширины - всегда показываем DualTranslator
  return <DualTranslator />;
}

export default AppShell;