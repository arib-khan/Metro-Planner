//screens\SuccessScreen.js
import React, { useState, useEffect } from 'react';
import { View, ScrollView, Linking } from 'react-native';
import { Button, Card, Text, Avatar, Chip } from 'react-native-paper';

export default function SuccessScreen({ navigation, route }) {
  const { documentId } = route.params || {};
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const openDashboard = () => {
    // Replace with your actual dashboard URL
    const dashboardUrl = 'https://your-dashboard-url.vercel.app/dashboard';
    Linking.openURL(dashboardUrl).catch(err => 
      console.error('Failed to open dashboard:', err)
    );
  };

  return (
    <ScrollView style={{ flex: 1, padding: 20 }}>
      <Card style={{ marginBottom: 20 }}>
        <Card.Content style={{ alignItems: 'center', padding: 30 }}>
          <Avatar.Icon 
            size={80} 
            icon="check-circle" 
            style={{ backgroundColor: 'transparent' }}
            color="#4CAF50"
          />
          <Text variant="headlineMedium" style={{ marginTop: 20, marginBottom: 10 }}>
            Success!
          </Text>
          <Text variant="bodyLarge" style={{ textAlign: 'center', marginBottom: 20 }}>
            Train induction form has been submitted successfully.
          </Text>
          
          {documentId && (
            <Chip 
              icon="database" 
              mode="outlined"
              style={{ marginBottom: 20 }}
            >
              Doc ID: {documentId.substring(0, 8)}...
            </Chip>
          )}

          <View style={{ 
            backgroundColor: '#e8f5e9', 
            padding: 16, 
            borderRadius: 8,
            width: '100%',
            marginTop: 10
          }}>
            <Text variant="bodyMedium" style={{ color: '#2e7d32', textAlign: 'center' }}>
              ✓ Data synced to web dashboard
            </Text>
            <Text variant="bodySmall" style={{ color: '#2e7d32', textAlign: 'center', marginTop: 5 }}>
              View it now on the dashboard
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={{ marginBottom: 15 }}>
        <Card.Content>
          <Text variant="titleLarge" style={{ marginBottom: 15 }}>
            Next Steps
          </Text>
          
          <View style={{ marginBottom: 10 }}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              • AI Processing
            </Text>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              Your submission is being processed by our AI engine
            </Text>
          </View>
          
          <View style={{ marginBottom: 10 }}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              • Schedule Optimization
            </Text>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              Optimal induction time will be calculated
            </Text>
          </View>
          
          <View style={{ marginBottom: 10 }}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              • Real-time Dashboard
            </Text>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              View your data instantly on the web dashboard
            </Text>
          </View>
          
          <View style={{ marginBottom: 10 }}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
              • Notification
            </Text>
            <Text variant="bodySmall" style={{ color: 'gray' }}>
              You'll receive updates via WhatsApp/Email
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={openDashboard}
        style={{ marginBottom: 10 }}
        icon="monitor-dashboard"
      >
        View on Web Dashboard
      </Button>

      <Button
        mode="contained"
        onPress={() => navigation.navigate('InductionForm')}
        style={{ marginBottom: 10 }}
        icon="plus"
      >
        New Induction Form
      </Button>

      <Button
        mode="outlined"
        onPress={() => navigation.navigate('Home')}
        icon="home"
      >
        Back to Dashboard {countdown > 0 && `(${countdown}s)`}
      </Button>

      {countdown === 0 && (
        <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 10, color: 'gray' }}>
          Redirecting to home...
        </Text>
      )}
    </ScrollView>
  );
}