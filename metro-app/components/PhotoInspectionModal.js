// components/PhotoInspectionModal.js
import React, { useState } from 'react';
import { View, Alert, Image, Platform } from 'react-native';
import { Modal, Button, Text, Portal, ActivityIndicator, TextInput } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../utils/authHelpers';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

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
        contentContainerStyle={{
          backgroundColor: 'white',
          padding: 20,
          margin: 20,
          borderRadius: 12,
          maxHeight: '90%',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }}
      >
        <View style={{ marginBottom: 16 }}>
          <Text variant="titleLarge" style={{ marginBottom: 8, textAlign: 'center', fontWeight: 'bold', color: '#1f2937' }}>
            📸 Photo Inspection
          </Text>
          <Text variant="bodyMedium" style={{ marginBottom: 8, textAlign: 'center', color: '#6b7280' }}>
            Upload a photo of train parts for AI inspection
          </Text>
          
          {/* Train ID Input */}
          <TextInput
            label="Train ID *"
            mode="outlined"
            value={trainId}
            onChangeText={setTrainId}
            placeholder="e.g., KMRC-001, MRT-202, EMU-001"
            style={{ marginBottom: 16 }}
            disabled={uploading}
            outlineColor="#d1d5db"
            activeOutlineColor="#ef4444"
            left={<TextInput.Icon icon="train" size={20} color="#6b7280" />}
          />
        </View>

        {/* Image Preview */}
        {imagePreview && (
          <View style={{ marginBottom: 20, alignItems: 'center' }}>
            <View style={{ position: 'relative', width: '100%' }}>
              <Image
                source={{ uri: imagePreview }}
                style={{
                  width: '100%',
                  height: 200,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: '#10b981',
                }}
                resizeMode="contain"
              />
              <View style={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'rgba(16, 185, 129, 0.9)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600', marginRight: 4 }}>
                  ✓
                </Text>
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>
                  Selected
                </Text>
              </View>
            </View>
            <Text variant="bodySmall" style={{ marginTop: 8, color: '#10b981', fontWeight: '500' }}>
              {selectedImage?.name}
            </Text>
            <Text variant="bodySmall" style={{ marginTop: 2, color: '#6b7280' }}>
              Size: {(selectedImage?.size / (1024 * 1024)).toFixed(2)} MB
            </Text>
          </View>
        )}

        {uploading ? (
          <View style={{ alignItems: 'center', marginVertical: 24 }}>
            <ActivityIndicator size="large" color="#ef4444" />
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: '600', color: '#1f2937' }}>
              Processing image with AI...
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: '#6b7280', textAlign: 'center' }}>
              Analyzing defects and identifying parts
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
              This may take a few seconds
            </Text>
          </View>
        ) : (
          <View>
            {!selectedImage ? (
              <Button
                mode="contained"
                onPress={pickImage}
                style={{ 
                  marginBottom: 12,
                  borderRadius: 8,
                  backgroundColor: '#ef4444'
                }}
                icon="camera"
                contentStyle={{ paddingVertical: 8 }}
                labelStyle={{ fontSize: 16, fontWeight: '600' }}
              >
                Select Photo
              </Button>
            ) : (
              <View>
                <Button
                  mode="contained"
                  onPress={uploadAndInspect}
                  style={{ 
                    marginBottom: 12,
                    borderRadius: 8,
                    backgroundColor: trainId.trim() ? '#10b981' : '#9ca3af'
                  }}
                  icon="upload"
                  disabled={!trainId.trim()}
                  contentStyle={{ paddingVertical: 8 }}
                  labelStyle={{ fontSize: 16, fontWeight: '600' }}
                >
                  Upload & Inspect
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                  }}
                  style={{ 
                    marginBottom: 12,
                    borderRadius: 8,
                    borderColor: '#ef4444'
                  }}
                  icon="image-edit"
                  textColor="#ef4444"
                  contentStyle={{ paddingVertical: 8 }}
                  labelStyle={{ fontSize: 16, fontWeight: '600' }}
                >
                  Choose Different Photo
                </Button>
              </View>
            )}

            {/* Instructions */}
            <View style={{ 
              backgroundColor: '#f9fafb', 
              padding: 12, 
              borderRadius: 8, 
              borderWidth: 1, 
              borderColor: '#e5e7eb',
              marginTop: 16 
            }}>
              <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                📋 For best results:
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={{ fontSize: 12, color: '#22c55e', marginRight: 4 }}>✓</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Focus on specific train parts
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Text style={{ fontSize: 12, color: '#22c55e', marginRight: 4 }}>✓</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Ensure good lighting
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <Text style={{ fontSize: 12, color: '#22c55e', marginRight: 4 }}>✓</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>
                  Avoid blurry images
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center', fontStyle: 'italic' }}>
                Supported: JPG, PNG, WEBP • Max 10MB
              </Text>
            </View>
          </View>
        )}

        <Button 
          mode="text" 
          onPress={handleCancel}
          disabled={uploading}
          textColor="#6b7280"
          style={{ marginTop: 16 }}
        >
          {uploading ? 'Cancel (Upload in Progress)' : 'Cancel'}
        </Button>
      </Modal>
    </Portal>
  );
};

export default PhotoInspectionModal;