// navigation/AppStack.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';
import InductionForm from '../screens/InductionForm';
import SuccessScreen from '../screens/SuccessScreen';
import TasksScreen from '../screens/TasksScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen'; // ← new

const Stack = createStackNavigator();

export default function AppStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0a0f1e',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: '#1e2d45',
        },
        headerTintColor: '#f0f4ff',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 16,
          letterSpacing: 0.4,
          color: '#f0f4ff',
        },
        headerBackTitleVisible: false,
        cardStyle: { backgroundColor: '#0a0f1e' },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="InductionForm"
        component={InductionForm}
        options={{ title: 'Train Induction', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Success"
        component={SuccessScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ title: 'My Tasks' }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'History & Analysis', headerTitleAlign: 'center' }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'My Profile', headerTitleAlign: 'center' }}
      />
    </Stack.Navigator>
  );
}