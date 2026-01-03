//screens\HomeScreen.js
import React, { useState, useEffect } from 'react';
import { View, ScrollView } from 'react-native';
import { Button, Card, Text, Avatar, FAB, Chip } from 'react-native-paper';
import { useAuth } from '../utils/authHelpers';
import FileUploadModal from '../components/FileUploadModal';
import { getPendingSubmissionsCount, syncPendingSubmissions } from '../utils/offlineSync';
import NetInfo from '@react-native-community/netinfo';

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Check pending submissions
    checkPendingSubmissions();

    // Monitor network status
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected);
      
      // Auto-sync when coming online
      if (state.isConnected && pendingCount > 0) {
        handleManualSync();
      }
    });

    return () => unsubscribe();
  }, []);

  const checkPendingSubmissions = async () => {
    const count = await getPendingSubmissionsCount();
    setPendingCount(count);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await syncPendingSubmissions();
      if (result.successful > 0) {
        alert(`Successfully synced ${result.successful} submission(s)!`);
        checkPendingSubmissions();
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleBulkUploadSuccess = () => {
    alert('Bulk upload completed successfully!');
    checkPendingSubmissions();
  };

  return (
    <>
      <ScrollView style={{ flex: 1, padding: 20 }}>
        {/* Connection Status */}
        <View style={{ marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip 
            icon={isOnline ? "wifi" : "wifi-off"} 
            mode="outlined"
            style={{ backgroundColor: isOnline ? '#e8f5e9' : '#ffebee' }}
          >
            {isOnline ? 'Online' : 'Offline'}
          </Chip>
          
          {pendingCount > 0 && (
            <Chip 
              icon="sync" 
              mode="outlined"
              style={{ backgroundColor: '#fff3e0' }}
              onPress={handleManualSync}
              disabled={!isOnline || syncing}
            >
              {syncing ? 'Syncing...' : `${pendingCount} pending`}
            </Chip>
          )}
        </View>

        <Card style={{ marginBottom: 20 }}>
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
              <Avatar.Icon size={50} icon="account" />
              <View style={{ marginLeft: 15 }}>
                <Text variant="titleMedium">Welcome, {user?.displayName || 'User'}</Text>
                <Text variant="bodyMedium" style={{ color: 'gray' }}>
                  {user?.email}
                </Text>
              </View>
            </View>
            
            <Text variant="bodyMedium" style={{ marginBottom: 20 }}>
              AI-Driven Train Induction System for Kochi Metro Rail Limited
            </Text>

            {/* Data Sync Info */}
            {isOnline && (
              <View style={{ 
                backgroundColor: '#e3f2fd', 
                padding: 12, 
                borderRadius: 8,
                marginTop: 10 
              }}>
                <Text variant="bodySmall" style={{ color: '#1976d2' }}>
                  ✓ Your data is syncing with the web dashboard in real-time
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <Card style={{ marginBottom: 15 }}>
          <Card.Content>
            <Text variant="titleLarge" style={{ marginBottom: 10 }}>
              Quick Actions
            </Text>
            
            <Button
              mode="contained"
              icon="train"
              onPress={() => navigation.navigate('InductionForm')}
              style={{ marginBottom: 10 }}
            >
              New Train Induction
            </Button>
            
            <Button
              mode="outlined"
              icon="file-upload"
              onPress={() => setUploadModalVisible(true)}
              style={{ marginBottom: 10 }}
            >
              Bulk Upload (CSV/XML)
            </Button>
            
            <Button
              mode="outlined"
              icon="history"
              onPress={() => alert('View submission history - Coming soon!')}
              style={{ marginBottom: 10 }}
            >
              View History
            </Button>
            
            <Button
              mode="outlined"
              icon="chart-line"
              onPress={() => alert('Analytics dashboard - Coming soon!')}
            >
              Analytics
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content>
            <Text variant="titleLarge" style={{ marginBottom: 10 }}>
              System Features
            </Text>
            
            <View style={{ marginBottom: 10 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                • Single & Bulk Upload
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Add individual trains or upload multiple via CSV/XML
              </Text>
            </View>
            
            <View style={{ marginBottom: 10 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                • Real-time Web Dashboard
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                View all submitted data instantly on the web dashboard
              </Text>
            </View>
            
            <View style={{ marginBottom: 10 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                • AI-Driven Scheduling
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Optimized train induction with predictive maintenance
              </Text>
            </View>
            
            <View style={{ marginBottom: 10 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                • Real-time Monitoring
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                IoT sensor integration for mileage, brake wear, and HVAC
              </Text>
            </View>
            
            <View style={{ marginBottom: 10 }}>
              <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>
                • Offline Support
              </Text>
              <Text variant="bodySmall" style={{ color: 'gray' }}>
                Submit forms even without internet connection
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="text"
          icon="logout"
          onPress={signOut}
          style={{ marginTop: 30, marginBottom: 20 }}
        >
          Logout
        </Button>
      </ScrollView>

      <FileUploadModal
        visible={uploadModalVisible}
        onDismiss={() => setUploadModalVisible(false)}
        onSuccess={handleBulkUploadSuccess}
      />

      <FAB
        icon="plus"
        style={{
          position: 'absolute',
          margin: 16,
          right: 0,
          bottom: 0,
          backgroundColor: '#2196F3',
        }}
        onPress={() => navigation.navigate('InductionForm')}
      />
    </>
  );
}