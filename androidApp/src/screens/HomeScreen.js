// src/screens/HomeScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    StatusBar, Alert, ActivityIndicator, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { useFocusEffect } from '@react-navigation/native';
import { loadDecks, saveDecks, clearDecks } from '../utils/storage';
import { Colors, Typography, Spacing, Radius } from '../theme';

export default function HomeScreen({ navigation }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(false);

    useFocusEffect(useCallback(() => {
        loadDecks().then(setDecks);
    }, []));

    async function importDecks() {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
            });
            if (result.canceled) return;

            setLoading(true);
            const uri = result.assets[0].uri;
            const text = await FileSystem.readAsStringAsync(uri);
            const parsed = JSON.parse(text);
            const arr = Array.isArray(parsed) ? parsed : [];
            await saveDecks(arr);
            setDecks(arr);
            Alert.alert('✅ Thành công', `Đã nhập ${arr.length} bộ thẻ.`);
        } catch (e) {
            Alert.alert('Lỗi', 'File không hợp lệ hoặc không phải decks.json.\n' + e.message);
        } finally {
            setLoading(false);
        }
    }

    function confirmClear() {
        Alert.alert('Xoá tất cả?', 'Toàn bộ bộ thẻ sẽ bị xoá khỏi app.', [
            { text: 'Huỷ', style: 'cancel' },
            { text: 'Xoá', style: 'destructive', onPress: async () => { await clearDecks(); setDecks([]); } },
        ]);
    }

    function renderDeck({ item }) {
        const cards = item.cards ?? [];
        const mc = cards.filter(c => c.question_type === 'multiple_choice').length;
        const date = item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '';

        const green = cards.filter(c => c.status === 2).length;
        const orange = cards.filter(c => c.status === 1).length;
        const gray = cards.filter(c => c.status === 0 || !c.status).length;

        return (
            <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('DeckDetail', { deck: item })}
            >
                <View style={styles.cardLeft}>
                    <View style={styles.iconBox}>
                        <Text style={styles.iconText}>📚</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.deckName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.deckMeta}>
                            {cards.length} thẻ  •  {mc} đa lựa chọn
                            {date ? `  •  ${date}` : ''}
                        </Text>
                        {cards.length > 0 && (
                            <View style={styles.progressContainer}>
                                <View style={styles.progressBar}>
                                    {green > 0 && <View style={[styles.progressFill, { flex: green, backgroundColor: Colors.success }]} />}
                                    {orange > 0 && <View style={[styles.progressFill, { flex: orange, backgroundColor: Colors.warning }]} />}
                                    {gray > 0 && <View style={[styles.progressFill, { flex: gray, backgroundColor: Colors.border }]} />}
                                </View>
                                <View style={styles.progressLabels}>
                                    <Text style={styles.progressLabel}>✅ {green}</Text>
                                    <Text style={styles.progressLabel}>❌ {orange}</Text>
                                    <Text style={styles.progressLabel}>⚪ {gray}</Text>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
                <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar backgroundColor={Colors.primary} barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>FlashcardAI</Text>
                    <Text style={styles.headerSub}>{decks.length} bộ thẻ</Text>
                </View>
                {decks.length > 0 && (
                    <TouchableOpacity onPress={confirmClear} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Xoá tất cả</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Import button */}
            <TouchableOpacity style={styles.importBtn} onPress={importDecks} disabled={loading}>
                {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.importBtnText}>📂  Nhập decks.json</Text>
                }
            </TouchableOpacity>

            {/* Deck list */}
            {decks.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyIcon}>📭</Text>
                    <Text style={styles.emptyTitle}>Chưa có bộ thẻ nào</Text>
                    <Text style={styles.emptyHint}>
                        Copy file decks.json từ máy tính sang điện thoại{'\n'}rồi bấm "Nhập decks.json" ở trên.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={decks}
                    keyExtractor={item => item.deck_id}
                    renderItem={renderDeck}
                    contentContainerStyle={{ padding: Spacing.md, paddingBottom: 80 }}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        backgroundColor: Colors.primary,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : 52,
        paddingBottom: 20,
        paddingHorizontal: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
    headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
    clearBtn: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: Radius.full,
    },
    clearBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    importBtn: {
        margin: Spacing.md,
        backgroundColor: Colors.primary,
        borderRadius: Radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    importBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        marginBottom: Spacing.sm,
        padding: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
    },
    cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    iconBox: {
        width: 44, height: 44,
        backgroundColor: Colors.primaryLight,
        borderRadius: Radius.sm,
        alignItems: 'center', justifyContent: 'center',
        marginRight: Spacing.md,
    },
    iconText: { fontSize: 22 },
    deckName: { fontSize: 15, fontWeight: '600', color: Colors.text, marginBottom: 3 },
    deckMeta: { fontSize: 13, color: Colors.textDim },
    arrow: { fontSize: 28, color: Colors.textDim, marginLeft: 12 },
    progressContainer: { marginTop: 8, paddingRight: 24 },
    progressBar: { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden', marginBottom: 4 },
    progressFill: { height: '100%' },
    progressLabels: { flexDirection: 'row', gap: 12 },
    progressLabel: { fontSize: 11, color: Colors.textDim, fontWeight: '600' },
    deckMeta: { fontSize: 12, color: Colors.textDim },
    arrow: { fontSize: 24, color: Colors.textLight, marginLeft: 8 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 8 },
    emptyHint: { fontSize: 14, color: Colors.textDim, textAlign: 'center', lineHeight: 22 },
});
