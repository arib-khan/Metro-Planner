// utils/i18n/LanguageContext.js
//
// Zero external dependencies — pure React context + AsyncStorage for persistence.
//
// Usage:
//   1. Wrap your root with <LanguageProvider>
//   2. In any component: const { t, language, setLanguage } = useLanguage();
//   3. Translate:  t('home.actions.newInduction')
//   4. With substitution: t('common.pendingSync', { count: 3 })
//      → '⟳ 3 pending'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import translations from './translations';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES = [
    { code: 'en', label: 'English', nativeLabel: 'English' },
    { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
    { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം' },
];

const STORAGE_KEY = 'kmrl_language';
const DEFAULT_LANGUAGE = 'en';

// ─────────────────────────────────────────────────────────────────────────────
// Dot-path resolver  e.g. resolve(obj, 'home.actions.newInduction')
// ─────────────────────────────────────────────────────────────────────────────

function resolve(obj, path) {
    return path.split('.').reduce((acc, key) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[key];
    }, obj);
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple template interpolation  '{{count}} pending' + { count: 3 } → '3 pending'
// ─────────────────────────────────────────────────────────────────────────────

function interpolate(str, params) {
    if (!params || typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        params[key] !== undefined ? String(params[key]) : `{{${key}}}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const LanguageContext = createContext(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
    const [ready, setReady] = useState(false);

    // Load persisted language on mount
    useEffect(() => {
        AsyncStorage.getItem(STORAGE_KEY)
            .then(saved => {
                if (saved && translations[saved]) {
                    setLanguageState(saved);
                }
            })
            .catch(() => {/* silently fall back to default */ })
            .finally(() => setReady(true));
    }, []);

    // Persist and apply language change
    const setLanguage = useCallback(async (code) => {
        if (!translations[code]) {
            console.warn(`[i18n] Unknown language code: "${code}". Falling back to "en".`);
            return;
        }
        setLanguageState(code);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, code);
        } catch {
            // Non-fatal: preference just won't persist across restarts
        }
    }, []);

    // Core translate function
    // t('some.key')                     → translated string
    // t('some.key', { count: 5 })       → translated string with substitution
    // Falls back: current lang → English → the key itself
    const t = useCallback((path, params) => {
        const inCurrent = resolve(translations[language], path);
        const value = inCurrent !== undefined
            ? inCurrent
            : resolve(translations[DEFAULT_LANGUAGE], path); // English fallback

        if (value === undefined) {
            if (__DEV__) console.warn(`[i18n] Missing key: "${path}" for language "${language}"`);
            return path; // Return the key so nothing breaks
        }

        return interpolate(String(value), params);
    }, [language]);

    if (!ready) return null; // Avoid flash of wrong language

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, SUPPORTED_LANGUAGES }}>
            {children}
        </LanguageContext.Provider>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useLanguage() {
    const ctx = useContext(LanguageContext);
    if (!ctx) {
        throw new Error('useLanguage() must be used inside <LanguageProvider>');
    }
    return ctx;
}