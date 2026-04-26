import React from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import AuthStack from './navigation/AuthStack';
import AppStack from './navigation/AppStack';
import { AuthProvider, useAuth } from './utils/authHelpers';
import { LanguageProvider } from './utils/i18n/LanguageContext';

function Navigation() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      {user ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <PaperProvider>
        <AuthProvider>
          <Navigation />
          <StatusBar style="auto" />
        </AuthProvider>
      </PaperProvider>
    </LanguageProvider>
  );
}