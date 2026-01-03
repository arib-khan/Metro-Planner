//components\FileUploadModal.js
import React, { useState } from 'react';
import { View, Alert, Platform } from 'react-native';
import { Modal, Button, Text, RadioButton, Portal, ActivityIndicator } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../utils/authHelpers';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const FileUploadModal = ({ visible, onDismiss, onSuccess }) => {
  const { user } = useAuth();
  const [fileType, setFileType] = useState('csv');
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');

  const pickFile = async () => {
    try {
      console.log('Starting file picker...');
      
      let mimeTypes = [];
      if (fileType === 'csv') {
        mimeTypes = [
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/vnd.ms-excel'
        ];
      } else {
        mimeTypes = [
          'text/xml',
          'application/xml',
          'application/xhtml+xml'
        ];
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      console.log('File picker result:', result);

      if (result.canceled) {
        console.log('User canceled file picker');
        Alert.alert('Info', 'File selection was canceled');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('Selected file:', file);
        
        Alert.alert(
          'Confirm File',
          `Do you want to process "${file.name}"?`,
          [
            {
              text: 'Cancel',
              style: 'cancel'
            },
            {
              text: 'Process',
              onPress: () => {
                setFileName(file.name);
                processFile(file.uri, file.name);
              }
            }
          ]
        );
      } else {
        Alert.alert('Error', 'No file was selected. Please try again.');
      }
    } catch (error) {
      console.error('File picker error:', error);
      Alert.alert(
        'File Selection Error', 
        'Please make sure you have a file manager app installed and try again.'
      );
    }
  };

  const processFile = async (fileUri, name) => {
    setUploading(true);
    try {
      console.log('Processing file from URI:', fileUri);
      
      const response = await fetch(fileUri);
      
      if (!response.ok) {
        throw new Error('Selected file cannot be accessed. Please try another file.');
      }

      const fileContent = await response.text();
      console.log('File content length:', fileContent.length);
      
      if (fileContent.length === 0) {
        throw new Error('The selected file appears to be empty.');
      }

      let result;
      if (fileType === 'csv') {
        result = await processCSV(fileContent, name);
      } else {
        result = await processXML(fileContent, name);
      }
      
      Alert.alert(
        'Success', 
        `Successfully uploaded ${result.count} record(s) to database!`
      );
      onSuccess();
      onDismiss();
    } catch (error) {
      console.error('File processing error:', error);
      Alert.alert(
        'Processing Error', 
        error.message || 'Failed to process the file. Please check the file format and try again.'
      );
    } finally {
      setUploading(false);
      setFileName('');
    }
  };

  const processCSV = async (csvContent, fileName) => {
    try {
      const normalizedContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        throw new Error('CSV file must contain at least a header row and one data row');
      }

      const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
      console.log('CSV Headers:', headers);

      // Group data by date (we'll use current date for all records)
      const currentDate = new Date().toISOString().split('T')[0];
      const groupedData = {
        date: currentDate,
        branding_priorities: [],
        cleaning_slots: [],
        stabling_geometry: [],
        fitness_certificates: [],
        job_card_status: [],
        mileage: []
      };

      let processedCount = 0;

      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        
        try {
          const values = parseCSVLine(lines[i]);
          const rowData = {};
          
          headers.forEach((header, index) => {
            rowData[header] = values[index] || '';
          });

          console.log(`Processing row ${i}:`, rowData);

          // Add to branding_priorities if data exists
          if (rowData.train_id && rowData.branding_type && rowData.branding_type !== 'None') {
            groupedData.branding_priorities.push({
              train_id: rowData.train_id,
              priority_level: parseInt(rowData.branding_priority_level) || 3,
              branding_type: rowData.branding_type,
              valid_from: rowData.branding_valid_from || currentDate,
              valid_to: rowData.branding_valid_to || currentDate,
              approved_by: rowData.branding_approved_by || "Marketing Dept",
              remarks: rowData.branding_remarks || ""
            });
          }

          // Add to cleaning_slots if data exists
          if (rowData.train_id && rowData.cleaning_type) {
            const slotStart = rowData.cleaning_slot_start 
              ? `${currentDate}T${rowData.cleaning_slot_start}` 
              : `${currentDate}T00:00`;
            const slotEnd = rowData.cleaning_slot_end 
              ? `${currentDate}T${rowData.cleaning_slot_end}` 
              : `${currentDate}T00:00`;

            groupedData.cleaning_slots.push({
              train_id: rowData.train_id,
              cleaning_type: rowData.cleaning_type,
              slot_start: slotStart,
              slot_end: slotEnd,
              assigned_team: rowData.cleaning_assigned_team || "Team A",
              status: rowData.cleaning_status || "Scheduled"
            });
          }

          // Add to stabling_geometry if data exists
          if (rowData.train_id && rowData.yard) {
            groupedData.stabling_geometry.push({
              train_id: rowData.train_id,
              yard: rowData.yard,
              track_no: parseInt(rowData.track_no) || 1,
              berth: rowData.berth || 'A1',
              orientation: rowData.orientation || "UP",
              distance_from_buffer_m: parseFloat(rowData.distance_from_buffer_m) || 4.5,
              remarks: rowData.stabling_remarks || ""
            });
          }

          // Add to fitness_certificates if data exists
          if (rowData.train_id && rowData.rolling_stock_validity) {
            groupedData.fitness_certificates.push({
              train_id: rowData.train_id,
              rolling_stock_validity: rowData.rolling_stock_validity || "",
              signalling_validity: rowData.signalling_validity || "",
              telecom_validity: rowData.telecom_validity || "",
              status: rowData.fitness_status || "Requires Check"
            });
          }

          // Add to job_card_status if data exists
          if (rowData.train_id && rowData.job_id) {
            const jobCard = {
              train_id: rowData.train_id,
              job_id: rowData.job_id,
              task: rowData.job_task || "",
              status: rowData.job_status || "Open",
              assigned_team: rowData.job_assigned_team || "Maintenance Team",
              due_date: rowData.job_due_date || currentDate
            };

            if (rowData.job_completed_on) {
              jobCard.completed_on = rowData.job_completed_on;
            }

            if (rowData.job_priority) {
              jobCard.priority = rowData.job_priority;
            }

            groupedData.job_card_status.push(jobCard);
          }

          // Add to mileage if data exists
          if (rowData.train_id && rowData.current_mileage_km) {
            const prevMileage = parseInt(rowData.previous_mileage_km) || 0;
            const currMileage = parseInt(rowData.current_mileage_km) || 0;

            groupedData.mileage.push({
              train_id: rowData.train_id,
              previous_mileage_km: prevMileage,
              current_mileage_km: currMileage,
              delta_km: currMileage - prevMileage,
              remarks: rowData.mileage_remarks || ""
            });
          }
          
          processedCount++;
        } catch (rowError) {
          console.error(`Error processing row ${i}:`, rowError);
        }
      }

      // Add metadata
      groupedData.userId = user.uid;
      groupedData.userName = user.displayName;
      groupedData.userEmail = user.email;
      groupedData.timestamp = serverTimestamp();
      groupedData.status = 'submitted';
      groupedData.syncStatus = 'synced';
      groupedData.source = 'bulk_upload';
      groupedData.original_file = fileName;

      console.log('Final grouped data:', JSON.stringify(groupedData, null, 2));
      
      // Save to Firestore
      const docRef = await addDoc(collection(db, 'trainInduction'), groupedData);
      console.log('✅ Saved to Firestore with ID:', docRef.id);

      return { count: processedCount };
    } catch (error) {
      console.error('CSV processing error:', error);
      throw error;
    }
  };

  const parseCSVLine = (line) => {
    const values = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    values.push(currentValue.trim());
    return values;
  };

  const processXML = async (xmlContent, fileName) => {
    try {
      // XML processing logic here (simplified for now)
      throw new Error('XML processing not yet implemented');
    } catch (error) {
      console.error('XML processing error:', error);
      throw new Error('Invalid XML format');
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: 'white',
          padding: 20,
          margin: 20,
          borderRadius: 8
        }}
      >
        <Text variant="titleLarge" style={{ marginBottom: 20, textAlign: 'center' }}>
          📁 Bulk Upload
        </Text>

        <Text variant="bodyMedium" style={{ marginBottom: 16, textAlign: 'center' }}>
          Upload CSV or XML file with multiple train records
        </Text>

        <RadioButton.Group onValueChange={setFileType} value={fileType}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <RadioButton value="csv" />
            <Text>CSV File (.csv)</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <RadioButton value="xml" />
            <Text>XML File (.xml)</Text>
          </View>
        </RadioButton.Group>

        {fileName ? (
          <Text variant="bodyMedium" style={{ marginBottom: 16, textAlign: 'center', color: 'green' }}>
            ✅ Selected: {fileName}
          </Text>
        ) : null}

        {uploading ? (
          <View style={{ alignItems: 'center', marginVertical: 20 }}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={{ marginTop: 10 }}>Processing and uploading to database...</Text>
          </View>
        ) : (
          <View>
            <Button
              mode="contained"
              onPress={pickFile}
              style={{ marginBottom: 10 }}
              icon="file-upload"
            >
              {Platform.OS === 'ios' ? 'Choose File from Storage' : 'Select File from Storage'}
            </Button>
            
            <Text variant="bodySmall" style={{ marginBottom: 16, textAlign: 'center', color: 'gray' }}>
              {Platform.OS === 'ios' 
                ? 'This will open your file browser. Select any .csv or .xml file.' 
                : 'This will open your file manager. Navigate to and select your file.'
              }
            </Text>
          </View>
        )}

        <Button 
          mode="outlined" 
          onPress={onDismiss}
          style={{ marginTop: 10 }}
          disabled={uploading}
        >
          {uploading ? 'Processing...' : 'Cancel'}
        </Button>
      </Modal>
    </Portal>
  );
};

export default FileUploadModal;