//navigation\AppStack.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';
import InductionForm from '../screens/InductionForm';
import SuccessScreen from '../screens/SuccessScreen';

const Stack = createStackNavigator();

export default function AppStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#2196F3' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ title: 'KMRL Dashboard' }}
      />
      <Stack.Screen 
        name="InductionForm" 
        component={InductionForm}
        options={{ title: 'Train Induction Form' }}
      />
      <Stack.Screen 
        name="Success" 
        component={SuccessScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}