// screens/SuccessScreen.js
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Button, Card, Text, Avatar, Chip } from 'react-native-paper';
import { useLanguage } from '../utils/i18n/LanguageContext';

export default function SuccessScreen({ navigation, route }) {
  const { documentId } = route.params || {};
  const { t } = useLanguage();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const openDashboard = () => {
    Linking.openURL('https://your-dashboard-url.vercel.app/dashboard')
      .catch(err => console.error('Failed to open dashboard:', err));
  };

  return (
    <ScrollView style={{ flex: 1, padding: 20 }}>
      <Card style={{ marginBottom: 20 }}>
        <Card.Content style={{ alignItems: 'center', padding: 30 }}>
          <Avatar.Icon size={80} icon="check-circle" style={{ backgroundColor: 'transparent' }} color="#4CAF50" />
          <Text variant="headlineMedium" style={{ marginTop: 20, marginBottom: 10 }}>
            {t('success.title')}
          </Text>
          <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 20 }}>
            {t('success.message')}
          </Text>

          {documentId && (
            <Chip icon="database" mode="outlined" style={{ marginBottom: 20 }}>
              {t('success.docId')} {documentId.substring(0, 8)}...
            </Chip>
          )}

          <View style={{ backgroundColor: '#e8f5e9', padding: 16, borderRadius: 8, width: '100%', marginTop: 10 }}>
            <Text variant="bodyMedium" style={{ color: '#2e7d32', textAlign: 'center' }}>
              {t('success.syncedLabel')}
            </Text>
            <Text variant="bodySmall" style={{ color: '#2e7d32', textAlign: 'center', marginTop: 5 }}>
              {t('success.syncedSub')}
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={{ marginBottom: 15 }}>
        <Card.Content>
          <Text variant="titleLarge" style={{ marginBottom: 15 }}>
            {t('success.nextStepsTitle')}
          </Text>
          {[
            ['aiTitle', 'aiSub'],
            ['scheduleTitle', 'scheduleSub'],
            ['dashboardTitle', 'dashboardSub'],
            ['notifTitle', 'notifSub'],
          ].map(([titleKey, subKey]) => (
            <View key={titleKey} style={{ marginBottom: 10 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                {t(`success.nextSteps.${titleKey}`)}
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                {t(`success.nextSteps.${subKey}`)}
              </Text>
            </View>
          ))}
        </Card.Content>
      </Card>

      <Button mode="contained" onPress={openDashboard} style={{ marginBottom: 10 }} icon="monitor-dashboard">
        {t('success.viewDashboard')}
      </Button>
      <Button mode="contained" onPress={() => navigation.navigate('InductionForm')} style={{ marginBottom: 10 }} icon="plus">
        {t('success.newForm')}
      </Button>
      <Button mode="outlined" onPress={() => navigation.navigate('Home')} icon="home">
        {t('success.backHome')} {countdown > 0 && `(${countdown}s)`}
      </Button>

      {countdown === 0 && (
        <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>
          {t('success.redirecting')}
        </Text>
      )}
    </ScrollView>
  );
}