// components/TextUploadModal.js
import React, { useState } from 'react';
import { View, Alert, Platform, StyleSheet } from 'react-native';
import { Modal, Button, Text, RadioButton, Portal, ActivityIndicator, IconButton } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../utils/authHelpers';

// Color palette matching HomeScreen
const C = {
  bg: '#0a0f1e',
  surface: '#111827',
  surface2: '#1a2235',
  border: '#1e2d45',
  accent: '#3b82f6',
  accentGlow: '#3b82f622',
  text: '#f0f4ff',
  textMuted: '#6b7fa3',
  textDim: '#3d506b',
  success: '#00e876',
  warning: '#f59e0b',
  error: '#ef4444',
};

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
        mimeTypes = ['text/csv', 'text/comma-separated-values', 'application/csv'];
      } else {
        mimeTypes = ['text/xml', 'application/xml'];
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      console.log('File picker result:', result);

      if (result.canceled) {
        console.log('User canceled file picker');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        console.log('Selected file:', file);

        setFileName(file.name);

        // Document Picker already reads the file content for us
        if (file.content) {
          await processFileContent(file.content, file.name);
        } else {
          Alert.alert('Error', 'Could not read file content. Please try another file.');
        }
      } else {
        Alert.alert('Error', 'No file was selected. Please try again.');
      }
    } catch (error) {
      console.error('File picker error:', error);
      Alert.alert('Error', 'Failed to pick file: ' + error.message);
    }
  };

  const processFileContent = async (fileContent, fileName) => {
    setUploading(true);
    try {
      console.log('File content length:', fileContent.length);

      if (!fileContent || fileContent.length === 0) {
        throw new Error('The selected file appears to be empty.');
      }

      if (fileType === 'csv') {
        await processCSV(fileContent, fileName);
      } else {
        await processXML(fileContent, fileName);
      }

      Alert.alert('Success', 'File processed successfully! Check console for data.');
      onSuccess();
      onDismiss();
    } catch (error) {
      console.error('File processing error:', error);
      Alert.alert('Error', error.message || 'Failed to process file.');
    } finally {
      setUploading(false);
      setFileName('');
    }
  };

  const processCSV = async (csvContent, fileName) => {
    try {
      // Handle different line endings
      const normalizedContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');

      if (lines.length < 2) {
        throw new Error('CSV file must contain at least a header row and one data row');
      }

      const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
      console.log('CSV Headers:', headers);

      let processedCount = 0;
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;

        // Handle quoted values and commas within values
        const values = parseCSVLine(lines[i]);
        const rowData = {};

        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });

        console.log(`Processing row ${i}:`, rowData);

        const transformedData = transformCSVRowToJSON(rowData, user, fileName);
        console.log('Transformed train data:', JSON.stringify(transformedData, null, 2));

        processedCount++;
      }

      console.log(`Successfully processed ${processedCount} train records`);
    } catch (error) {
      console.error('CSV processing error:', error);
      throw error;
    }
  };

  // Improved CSV line parser that handles quotes and commas
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

    // Push the last value
    values.push(currentValue.trim());

    return values;
  };

  const transformCSVRowToJSON = (rowData, user, fileName) => {
    const currentDate = new Date().toISOString().split('T')[0];
    const trainId = rowData.train_id || rowData.trainid || `KMRC-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    return {
      date: currentDate,

      branding_priorities: (rowData.branding_type || rowData.branding) && (rowData.branding_type || rowData.branding) !== 'None' ? [{
        train_id: trainId,
        priority_level: parseInt(rowData.priority_level || rowData.priority) ||
          ((rowData.branding_type || rowData.branding) === 'Gold' ? 1 :
            (rowData.branding_type || rowData.branding) === 'Silver' ? 2 : 3),
        branding_type: rowData.branding_type || rowData.branding,
        valid_from: rowData.valid_from || currentDate,
        valid_to: rowData.valid_to || currentDate,
        approved_by: rowData.approved_by || "Marketing Dept",
        remarks: rowData.branding_remarks || rowData.remarks || `Remaining hours: ${rowData.remaining_exposure_hours || 0}`
      }] : [],

      cleaning_slots: (rowData.cleaning_type || rowData.cleaning) && (rowData.cleaning_type || rowData.cleaning) !== 'None' ? [{
        train_id: trainId,
        cleaning_type: rowData.cleaning_type || rowData.cleaning,
        slot_start: `${currentDate}T${rowData.cleaning_time || '00:00'}`,
        slot_end: `${currentDate}T${rowData.cleaning_time || '23:59'}`,
        assigned_team: rowData.assigned_team || rowData.team || "Cleaning Team",
        status: "Scheduled"
      }] : [],

      stabling_geometry: [{
        train_id: trainId,
        yard: (rowData.depot || rowData.yard) ? `${rowData.depot || rowData.yard} Depot` : 'Muttom Depot',
        track_no: parseInt(rowData.track_no || rowData.track) || 1,
        berth: rowData.berth || 'A1',
        orientation: "UP",
        distance_from_buffer_m: 4.5,
        remarks: rowData.stabling_remarks || rowData.remarks || "Normal parking"
      }],

      fitness_certificates: [{
        train_id: trainId,
        rolling_stock_validity: (rowData.rolling_stock_certificate || rowData.rolling_stock) === 'Valid' ? (rowData.certificate_expiry || rowData.expiry || currentDate) : '',
        signalling_validity: (rowData.signalling_certificate || rowData.signalling) === 'Valid' ? (rowData.certificate_expiry || rowData.expiry || currentDate) : '',
        telecom_validity: (rowData.telecom_certificate || rowData.telecom) === 'Valid' ? (rowData.certificate_expiry || rowData.expiry || currentDate) : '',
        status: ((rowData.rolling_stock_certificate || rowData.rolling_stock) === 'Valid' &&
          (rowData.signalling_certificate || rowData.signalling) === 'Valid' &&
          (rowData.telecom_certificate || rowData.telecom) === 'Valid') ? "Fit for Service" : "Requires Check"
      }],

      job_card_status: (rowData.job_description || rowData.description) ? [{
        train_id: trainId,
        job_id: rowData.job_card_number || rowData.job_id || `JC-${Math.floor(Math.random() * 9000) + 1000}`,
        task: rowData.job_description || rowData.description,
        status: rowData.work_order_status || rowData.status || "Open",
        assigned_team: rowData.assigned_team || rowData.team || "Maintenance Team",
        due_date: currentDate,
        priority: rowData.priority || "Medium"
      }] : [],

      mileage: [{
        train_id: trainId,
        previous_mileage_km: parseInt(rowData.last_maintenance_mileage || rowData.last_mileage) || 0,
        current_mileage_km: parseInt(rowData.current_mileage || rowData.mileage) || 0,
        delta_km: (parseInt(rowData.current_mileage || rowData.mileage) || 0) - (parseInt(rowData.last_maintenance_mileage || rowData.last_mileage) || 0),
        remarks: `Daily average: ${rowData.daily_average_mileage || rowData.daily_mileage || 0} km, Next maintenance: ${rowData.next_maintenance_due || rowData.next_mileage || 0} km`
      }],

      // Metadata
      userId: user.uid,
      userName: user.displayName,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
      status: 'submitted',
      syncStatus: 'synced',
      source: 'bulk_upload',
      original_file: fileName
    };
  };

  const processXML = async (xmlContent, fileName) => {
    try {
      const trains = parseSimpleXML(xmlContent);
      console.log(`Found ${trains.length} train records in XML`);

      for (const trainData of trains) {
        const transformedData = transformXMLToJSON(trainData, user, fileName);
        console.log('Processed train data:', JSON.stringify(transformedData, null, 2));
      }
    } catch (error) {
      console.error('XML processing error:', error);
      throw new Error('Invalid XML format');
    }
  };

  const parseSimpleXML = (xmlContent) => {
    const trains = [];

    try {
      const trainMatches = xmlContent.match(/<train>[\s\S]*?<\/train>/gi) || [];

      for (const trainMatch of trainMatches) {
        const trainData = {};

        const fields = ['train_id', 'current_mileage', 'branding_type', 'cleaning_type', 'depot', 'status'];

        fields.forEach(field => {
          const regex = new RegExp(`<${field}>([\\s\\S]*?)<\/${field}>`, 'i');
          const match = trainMatch.match(regex);
          if (match && match[1]) {
            trainData[field] = match[1].trim();
          }
        });

        if (trainData.train_id) {
          trains.push(trainData);
        }
      }
    } catch (error) {
      console.error('XML parsing error:', error);
    }

    return trains;
  };

  const transformXMLToJSON = (xmlData, user, fileName) => {
    const currentDate = new Date().toISOString().split('T')[0];
    const trainId = xmlData.train_id || `KMRC-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

    return {
      date: currentDate,

      branding_priorities: xmlData.branding_type && xmlData.branding_type !== 'None' ? [{
        train_id: trainId,
        priority_level: 2,
        branding_type: xmlData.branding_type,
        valid_from: currentDate,
        valid_to: currentDate,
        approved_by: "Marketing Dept",
        remarks: "From XML upload"
      }] : [],

      stabling_geometry: [{
        train_id: trainId,
        yard: xmlData.depot ? `${xmlData.depot} Depot` : 'Muttom Depot',
        track_no: 1,
        berth: 'A1',
        orientation: "UP",
        distance_from_buffer_m: 4.5,
        remarks: "From XML upload"
      }],

      mileage: [{
        train_id: trainId,
        previous_mileage_km: 0,
        current_mileage_km: parseInt(xmlData.current_mileage) || 0,
        delta_km: parseInt(xmlData.current_mileage) || 0,
        remarks: "Uploaded via XML"
      }],

      userId: user.uid,
      userName: user.displayName,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
      status: 'submitted',
      syncStatus: 'synced',
      source: 'bulk_upload',
      original_file: fileName
    };
  };

  // Use sample data without file system
  const useSampleData = async () => {
    setUploading(true);
    try {
      const sampleCSV = `train_id,rolling_stock_certificate,current_mileage,branding_type,depot,status
KMRC-001,Valid,45000,Gold,Muttom,Active
KMRC-002,Valid,52000,Silver,Kalamassery,Active
KMRC-003,Expired,38000,None,Muttom,Maintenance`;

      await processCSV(sampleCSV, 'sample_data.csv');

      Alert.alert('Success', 'Sample data processed! Check console for results.');
      onSuccess();
      onDismiss();
    } catch (error) {
      Alert.alert('Error', 'Failed to process sample data: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalContainer}
      >
        <View style={styles.modalHeader}>
          <View style={styles.headerLeft}>
            <IconButton icon="file-upload" size={28} iconColor={C.accent} />
            <Text variant="titleLarge" style={styles.modalTitle}>
              Bulk Upload
            </Text>
          </View>
          <IconButton
            icon="close"
            size={20}
            iconColor={C.textMuted}
            onPress={onDismiss}
          />
        </View>

        <Text variant="bodyMedium" style={styles.modalSubtitle}>
          Upload CSV or XML file with train data
        </Text>

        <View style={styles.radioGroup}>
          <RadioButton.Group onValueChange={setFileType} value={fileType}>
            <View style={styles.radioItem}>
              <RadioButton value="csv" color={C.accent} />
              <Text style={styles.radioLabel}>CSV File</Text>
            </View>
            <View style={styles.radioItem}>
              <RadioButton value="xml" color={C.accent} />
              <Text style={styles.radioLabel}>XML File</Text>
            </View>
          </RadioButton.Group>
        </View>

        {fileName && (
          <View style={styles.fileNameContainer}>
            <IconButton icon="check-circle" size={18} iconColor={C.success} />
            <Text variant="bodyMedium" style={styles.fileName}>
              Selected: {fileName}
            </Text>
          </View>
        )}

        {uploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.progressText}>Processing...</Text>
          </View>
        ) : (
          <View>
            <Button
              mode="contained"
              onPress={pickFile}
              style={styles.selectButton}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              icon="file-upload"
            >
              Select File
            </Button>

            <Button
              mode="outlined"
              onPress={useSampleData}
              style={styles.sampleButton}
              labelStyle={styles.sampleButtonLabel}
              icon="file-document"
            >
              Use Sample Data
            </Button>

            <Text variant="bodySmall" style={styles.supportedText}>
              Supported: CSV files with train data
            </Text>
          </View>
        )}

        <Button
          mode="outlined"
          onPress={onDismiss}
          disabled={uploading}
          style={styles.cancelButton}
          labelStyle={styles.cancelButtonLabel}
        >
          Cancel
        </Button>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    backgroundColor: C.surface,
    padding: 20,
    margin: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  modalSubtitle: {
    color: C.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  radioGroup: {
    backgroundColor: C.surface2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  radioLabel: {
    color: C.text,
    fontSize: 14,
    marginLeft: 8,
  },
  fileNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.success,
  },
  fileName: {
    color: C.success,
    fontSize: 14,
    fontWeight: '500',
  },
  uploadingContainer: {
    alignItems: 'center',
    marginVertical: 20,
    backgroundColor: C.surface2,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  progressText: {
    marginTop: 10,
    color: C.textMuted,
    fontSize: 13,
  },
  selectButton: {
    marginBottom: 10,
    backgroundColor: C.accent,
    borderRadius: 12,
  },
  sampleButton: {
    marginBottom: 10,
    borderRadius: 12,
    borderColor: C.accent,
  },
  sampleButtonLabel: {
    color: C.accent,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  supportedText: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  cancelButton: {
    borderRadius: 12,
    borderColor: C.border,
  },
  cancelButtonLabel: {
    color: C.textMuted,
  },
});

export default FileUploadModal;