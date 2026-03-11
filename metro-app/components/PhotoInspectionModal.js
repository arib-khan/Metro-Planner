// components/PhotoInspectionModal.js
import React, { useState } from 'react';
import { View, Alert, Image, Platform, StyleSheet } from 'react-native';
import { Modal, Button, Text, Portal, ActivityIndicator, TextInput, IconButton } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../utils/authHelpers';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

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

const PhotoInspectionModal = ({ visible, onDismiss, onSuccess }) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [trainId, setTrainId] = useState('');
  const [imagePreview, setImagePreview] = useState(null);

  const resetForm = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setTrainId('');
    setUploading(false);
    onDismiss();
  };

  const handleCancel = () => {
    if (uploading) {
      Alert.alert(
        'Cancel Upload?',
        'The inspection is currently in progress. Are you sure you want to cancel?',
        [
          {
            text: 'Continue Upload',
            style: 'cancel'
          },
          {
            text: 'Cancel Upload',
            onPress: resetForm,
            style: 'destructive'
          }
        ]
      );
    } else {
      resetForm();
    }
  };

  const pickImage = async () => {
    try {
      console.log('Starting image picker...');

      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      console.log('Image picker result:', result);

      if (result.canceled) {
        console.log('User canceled image picker');
        return;
      }

      if (result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        console.log('Selected image:', image);

        // Validate file size (max 10MB)
        if (image.size > 10 * 1024 * 1024) {
          Alert.alert('Error', 'Image size should not exceed 10MB');
          return;
        }

        setSelectedImage(image);
        setImagePreview(image.uri);

        Alert.alert(
          'Image Selected',
          `"${image.name}" is ready to inspect. Please enter the train ID.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'No image was selected. Please try again.');
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert(
        'Image Selection Error',
        'Please make sure you have permission to access photos and try again.'
      );
    }
  };

  const uploadAndInspect = async () => {
    if (!selectedImage) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    if (!trainId.trim()) {
      Alert.alert('Error', 'Please enter a Train ID');
      return;
    }

    setUploading(true);
    try {
      console.log('Starting upload to API...');

      // Create FormData
      const formData = new FormData();

      // Determine the correct MIME type
      let mimeType = 'image/jpeg';
      if (selectedImage.name) {
        const ext = selectedImage.name.toLowerCase();
        if (ext.endsWith('.png')) mimeType = 'image/png';
        else if (ext.endsWith('.webp')) mimeType = 'image/webp';
        else if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
      }

      // Append image file
      formData.append('image', {
        uri: selectedImage.uri,
        type: mimeType,
        name: selectedImage.name || 'photo.jpg',
      });

      console.log('Sending request to API with MIME type:', mimeType);

      // Call the inspection API
      const response = await fetch('https://image-description-rqjq.onrender.com/inspect', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      console.log('API Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const apiResponse = await response.json();
      console.log('API Response:', JSON.stringify(apiResponse, null, 2));

      // Extract the JSON string from the result field
      const resultString = apiResponse.result || '';
      console.log('Result String:', resultString);

      // Parse the JSON from the markdown code block
      let parsedResult = {};
      try {
        // Extract JSON from the markdown code block
        const jsonMatch = resultString.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          parsedResult = JSON.parse(jsonMatch[1]);
          console.log('Parsed Result:', parsedResult);
        } else {
          // If no markdown, try parsing the whole string
          parsedResult = JSON.parse(resultString);
        }
      } catch (parseError) {
        console.error('Failed to parse JSON from API response:', parseError);
        console.log('Raw result string:', resultString);
        // If parsing fails, check if the response already has the data
        if (apiResponse.part_name) {
          parsedResult = apiResponse;
        } else {
          // Fallback to default values
          parsedResult = {
            part_name: 'N/A - No identifiable machine parts',
            damage_status: 'not_applicable',
            description_of_issue: 'Unable to parse AI response',
            should_replace: 'not_applicable',
            confidence: 0
          };
        }
      }

      // Extract data from the parsed result with fallbacks
      const {
        part_name = 'N/A - No identifiable machine parts',
        damage_status = 'not_applicable',
        description_of_issue = 'No description available',
        should_replace = 'not_applicable',
        confidence = 0
      } = parsedResult;

      console.log('Extracted Data:', {
        part_name,
        damage_status,
        description_of_issue,
        should_replace,
        confidence
      });

      // Format the inspection message with structured data
      const inspectionMessage = `
🔍 AI INSPECTION RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Part Identified: ${part_name}
Damage Status: ${damage_status}
Replacement Needed: ${should_replace}
Confidence Level: ${confidence}%

📋 ISSUE DESCRIPTION:
${description_of_issue}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI-Powered Defect Detection System
      `.trim();

      // Save to Firestore (photoReports collection)
      const reportData = {
        trainId: trainId.trim(),
        inspectionMessage: inspectionMessage,
        // Store the structured data separately for better querying
        inspectionData: {
          part_name,
          damage_status,
          description_of_issue,
          should_replace,
          confidence,
          raw_response: apiResponse // Store the complete raw response
        },
        imageName: selectedImage.name,
        imageSize: selectedImage.size,
        mimeType: mimeType,
        userId: user.uid,
        userName: user.displayName || user.email,
        userEmail: user.email,
        timestamp: serverTimestamp(),
        status: 'completed',
        source: 'mobile_photo_inspection'
      };

      const docRef = await addDoc(collection(db, 'photoReports'), reportData);
      console.log('✅ Photo inspection report saved with ID:', docRef.id);
      console.log('Saved Data:', reportData);

      // Check if no machine parts were detected
      const noPartsDetected = part_name.includes('No identifiable machine parts');

      // Show appropriate success message
      if (noPartsDetected) {
        Alert.alert(
          '⚠️ No Machine Parts Detected',
          `The AI did not detect any machine parts in the image.\n\nTrain: ${trainId}\n\nReason: ${description_of_issue}`,
          [
            {
              text: 'Retake Photo',
              onPress: () => {
                setSelectedImage(null);
                setImagePreview(null);
                setUploading(false);
              },
              style: 'cancel'
            },
            {
              text: 'Submit Anyway',
              onPress: () => {
                Alert.alert(
                  'Report Submitted',
                  'Report has been submitted to dashboard with "No parts detected" status.',
                  [{
                    text: 'OK',
                    onPress: () => {
                      onSuccess();
                      resetForm();
                    }
                  }]
                );
              }
            }
          ]
        );
      } else {
        // Show a more informative success message when parts are detected
        Alert.alert(
          '✅ Inspection Complete!',
          `Train ${trainId} inspection completed.\n\nPart: ${part_name}\nStatus: ${damage_status}\nConfidence: ${confidence}%\n\nReport submitted to dashboard.`,
          [
            {
              text: 'View Details',
              onPress: () => {
                Alert.alert(
                  'Inspection Details',
                  `🚂 Train: ${trainId}\n\n🔧 Part: ${part_name}\n\n📋 Issue: ${description_of_issue}\n\n⚡ Damage Status: ${damage_status}\n🔄 Replacement: ${should_replace}\n🎯 Confidence: ${confidence}%`,
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        onSuccess();
                        resetForm();
                      }
                    }
                  ]
                );
              }
            },
            {
              text: 'OK',
              onPress: () => {
                onSuccess();
                resetForm();
              }
            }
          ]
        );
      }

    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = error.message || 'Failed to process the image. Please check your connection and try again.';

      // Handle specific error cases
      if (errorMessage.includes('Network request failed')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Request timed out. The server might be busy. Please try again.';
      }

      Alert.alert(
        'Upload Failed',
        errorMessage,
        [
          {
            text: 'Retry',
            onPress: () => setUploading(false)
          },
          {
            text: 'Cancel',
            onPress: () => {
              setUploading(false);
              resetForm();
            },
            style: 'cancel'
          }
        ]
      );
    } finally {
      // Only set uploading to false if not handling retry
      if (!uploading) {
        setUploading(false);
      }
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleCancel}
        contentContainerStyle={styles.modalContainer}
      >
        <View style={styles.modalHeader}>
          <View style={styles.headerLeft}>
            <IconButton icon="camera" size={28} iconColor={C.accent} />
            <Text variant="titleLarge" style={styles.modalTitle}>
              Photo Inspection
            </Text>
          </View>
          <IconButton
            icon="close"
            size={20}
            iconColor={C.textMuted}
            onPress={handleCancel}
          />
        </View>

        <Text variant="bodyMedium" style={styles.modalSubtitle}>
          Upload a photo of train parts for AI inspection
        </Text>

        {/* Train ID Input */}
        <TextInput
          label="Train ID *"
          mode="outlined"
          value={trainId}
          onChangeText={setTrainId}
          placeholder="e.g., KMRC-001, MRT-202, EMU-001"
          style={styles.trainIdInput}
          disabled={uploading}
          outlineColor={C.border}
          activeOutlineColor={C.accent}
          textColor={C.text}
          theme={{
            colors: {
              background: C.surface2,
              onSurfaceVariant: C.textMuted,
            }
          }}
          left={<TextInput.Icon icon="train" size={20} color={C.textMuted} />}
        />

        {/* Image Preview */}
        {imagePreview && (
          <View style={styles.previewContainer}>
            <View style={styles.imageWrapper}>
              <Image
                source={{ uri: imagePreview }}
                style={styles.imagePreview}
                resizeMode="contain"
              />
              <View style={styles.selectedBadge}>
                <IconButton icon="check-circle" size={16} iconColor={C.success} />
                <Text style={styles.selectedText}>Selected</Text>
              </View>
            </View>
            <Text variant="bodySmall" style={styles.imageName}>
              {selectedImage?.name}
            </Text>
            <Text variant="bodySmall" style={styles.imageSize}>
              Size: {(selectedImage?.size / (1024 * 1024)).toFixed(2)} MB
            </Text>
          </View>
        )}

        {uploading ? (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.uploadingTitle}>
              Processing image with AI...
            </Text>
            <Text style={styles.uploadingSubtitle}>
              Analyzing defects and identifying parts
            </Text>
            <Text style={styles.uploadingHint}>
              This may take a few seconds
            </Text>
          </View>
        ) : (
          <View>
            {!selectedImage ? (
              <Button
                mode="contained"
                onPress={pickImage}
                style={styles.selectButton}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
                icon="camera"
              >
                Select Photo
              </Button>
            ) : (
              <View>
                <Button
                  mode="contained"
                  onPress={uploadAndInspect}
                  style={[
                    styles.inspectButton,
                    !trainId.trim() && styles.inspectButtonDisabled
                  ]}
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                  icon="upload"
                  disabled={!trainId.trim()}
                >
                  Upload & Inspect
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                  }}
                  style={styles.changeButton}
                  labelStyle={styles.changeButtonLabel}
                  icon="image-edit"
                >
                  Choose Different Photo
                </Button>
              </View>
            )}

            {/* Instructions */}
            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsTitle}>📋 For best results:</Text>
              <View style={styles.instructionItem}>
                <IconButton icon="check-circle" size={14} iconColor={C.success} style={styles.instructionIcon} />
                <Text style={styles.instructionText}>Focus on specific train parts</Text>
              </View>
              <View style={styles.instructionItem}>
                <IconButton icon="check-circle" size={14} iconColor={C.success} style={styles.instructionIcon} />
                <Text style={styles.instructionText}>Ensure good lighting</Text>
              </View>
              <View style={styles.instructionItem}>
                <IconButton icon="check-circle" size={14} iconColor={C.success} style={styles.instructionIcon} />
                <Text style={styles.instructionText}>Avoid blurry images</Text>
              </View>
              <Text style={styles.supportedFormats}>
                Supported: JPG, PNG, WEBP • Max 10MB
              </Text>
            </View>
          </View>
        )}

        <Button
          mode="text"
          onPress={handleCancel}
          disabled={uploading}
          style={styles.cancelButton}
          labelStyle={styles.cancelButtonLabel}
        >
          {uploading ? 'Cancel (Upload in Progress)' : 'Cancel'}
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
    maxHeight: '90%',
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
    marginBottom: 16,
  },
  trainIdInput: {
    marginBottom: 16,
    backgroundColor: C.surface2,
  },
  previewContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.success,
    backgroundColor: C.surface2,
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: C.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.success,
  },
  selectedText: {
    color: C.success,
    fontSize: 12,
    fontWeight: '600',
  },
  imageName: {
    marginTop: 8,
    color: C.success,
    fontWeight: '500',
  },
  imageSize: {
    marginTop: 2,
    color: C.textMuted,
  },
  uploadingContainer: {
    alignItems: 'center',
    marginVertical: 24,
    backgroundColor: C.surface2,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  uploadingTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  uploadingSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: C.textMuted,
    textAlign: 'center',
  },
  uploadingHint: {
    marginTop: 4,
    fontSize: 12,
    color: C.textDim,
    fontStyle: 'italic',
  },
  selectButton: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: C.accent,
  },
  inspectButton: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: C.success,
  },
  inspectButtonDisabled: {
    backgroundColor: C.textDim,
  },
  changeButton: {
    marginBottom: 12,
    borderRadius: 12,
    borderColor: C.accent,
  },
  changeButtonLabel: {
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
  instructionsContainer: {
    backgroundColor: C.surface2,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 16,
  },
  instructionsTitle: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  instructionIcon: {
    margin: 0,
    marginRight: 4,
  },
  instructionText: {
    fontSize: 12,
    color: C.textMuted,
    flex: 1,
  },
  supportedFormats: {
    fontSize: 11,
    color: C.textDim,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  cancelButton: {
    marginTop: 16,
  },
  cancelButtonLabel: {
    color: C.textMuted,
  },
});

export default PhotoInspectionModal;