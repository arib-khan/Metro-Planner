// components/LanguageSwitcher.js
//
// Drop this anywhere — header, settings panel, HomeScreen footer, etc.
//
// <LanguageSwitcher />          — default compact pill row
// <LanguageSwitcher size="lg" /> — larger text for settings page

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useLanguage, SUPPORTED_LANGUAGES } from '../utils/i18n/LanguageContext';

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
};

export default function LanguageSwitcher({ size = 'sm' }) {
    const { language, setLanguage } = useLanguage();
    const isLg = size === 'lg';

    return (
        <View style={styles.row}>
            {SUPPORTED_LANGUAGES.map((lang, idx) => {
                const active = language === lang.code;
                return (
                    <TouchableOpacity
                        key={lang.code}
                        onPress={() => setLanguage(lang.code)}
                        activeOpacity={0.75}
                        style={[
                            styles.pill,
                            isLg && styles.pillLg,
                            active ? styles.pillActive : styles.pillInactive,
                            idx === 0 && styles.pillFirst,
                            idx === SUPPORTED_LANGUAGES.length - 1 && styles.pillLast,
                        ]}
                    >
                        <Text
                            style={[
                                styles.pillText,
                                isLg && styles.pillTextLg,
                                active ? styles.pillTextActive : styles.pillTextInactive,
                            ]}
                        >
                            {lang.nativeLabel}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignSelf: 'flex-start',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: C.border,
        overflow: 'hidden',
        backgroundColor: C.surface,
    },
    pill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    pillLg: {
        paddingHorizontal: 16,
        paddingVertical: 9,
    },
    pillFirst: {
        // leftmost — no extra style needed, overflow:hidden on parent clips
    },
    pillLast: {
        // rightmost
    },
    pillActive: {
        backgroundColor: C.accent,
    },
    pillInactive: {
        backgroundColor: 'transparent',
    },
    pillText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    pillTextLg: {
        fontSize: 14,
        letterSpacing: 0.4,
    },
    pillTextActive: {
        color: '#ffffff',
    },
    pillTextInactive: {
        color: C.textMuted,
    },
});