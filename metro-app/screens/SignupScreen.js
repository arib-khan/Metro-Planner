//screens\SignupScreen.js
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Button, TextInput, Text, HelperText } from 'react-native-paper';
import { Formik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../utils/authHelpers';

const SignupSchema = Yup.object().shape({
  name: Yup.string().required('Name is required'),
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password'), null], 'Passwords must match')
    .required('Confirm Password is required'),
});

export default function SignupScreen({ navigation }) {
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignup = async (values) => {
    setLoading(true);
    try {
      await signUp(values.email, values.password, values.name);
      // Navigation handled by auth state change
    } catch (error) {
      alert('Signup failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1 }}>
        <Text variant="headlineMedium" style={{ marginBottom: 30, textAlign: 'center' }}>
          Create Account
        </Text>

        <Formik
          initialValues={{
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
          }}
          validationSchema={SignupSchema}
          onSubmit={handleSignup}
        >
          {({ handleChange, handleBlur, handleSubmit, values, errors, touched }) => (
            <View>
              <TextInput
                label="Full Name"
                mode="outlined"
                value={values.name}
                onChangeText={handleChange('name')}
                onBlur={handleBlur('name')}
                error={touched.name && errors.name}
                style={{ marginBottom: 15 }}
              />
              {touched.name && errors.name && (
                <HelperText type="error">{errors.name}</HelperText>
              )}

              <TextInput
                label="Email"
                mode="outlined"
                value={values.email}
                onChangeText={handleChange('email')}
                onBlur={handleBlur('email')}
                keyboardType="email-address"
                autoCapitalize="none"
                error={touched.email && errors.email}
                style={{ marginBottom: 15 }}
              />
              {touched.email && errors.email && (
                <HelperText type="error">{errors.email}</HelperText>
              )}

              <TextInput
                label="Password"
                mode="outlined"
                value={values.password}
                onChangeText={handleChange('password')}
                onBlur={handleBlur('password')}
                secureTextEntry
                error={touched.password && errors.password}
                style={{ marginBottom: 15 }}
              />
              {touched.password && errors.password && (
                <HelperText type="error">{errors.password}</HelperText>
              )}

              <TextInput
                label="Confirm Password"
                mode="outlined"
                value={values.confirmPassword}
                onChangeText={handleChange('confirmPassword')}
                onBlur={handleBlur('confirmPassword')}
                secureTextEntry
                error={touched.confirmPassword && errors.confirmPassword}
                style={{ marginBottom: 30 }}
              />
              {touched.confirmPassword && errors.confirmPassword && (
                <HelperText type="error">{errors.confirmPassword}</HelperText>
              )}

              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={{ marginBottom: 15 }}
              >
                Sign Up
              </Button>

              <Button
                mode="text"
                onPress={() => navigation.navigate('Login')}
              >
                Already have an account? Login
              </Button>
            </View>
          )}
        </Formik>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}