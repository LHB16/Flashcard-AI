// src/screens/HomeScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, StyleSheet,
    StatusBar, Alert, ActivityIndicator, Platform, Modal, Linking
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const CURRENT_VERSION = Constants.expoConfig?.version || '1.0.1';

import { useFocusEffect } from '@react-navigation/native';
import { loadDecks, saveDecks, clearDecks } from '../utils/storage';
import { Colors, Typography, Spacing, Radius } from '../theme';

export default function HomeScreen({ navigation }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updateInfo, setUpdateInfo] = useState(null);
    const [ignoreUpdate, setIgnoreUpdate] = useState(false);
    const [checkingUpdate, setCheckingUpdate] = useState(false);

    useFocusEffect(useCallback(() => {
        loadDecks().then(setDecks);
    }, []));

    useEffect(() => {
        checkUpdates(false);
    }, []);

    async function checkUpdates(isManual = false) {
        try {
            if (isManual) setCheckingUpdate(true);
            const res = await fetch('https://api.github.com/repos/LHB16/Flashcard-AI/releases/latest');
            if (!res.ok) {
                if (isManual) Alert.alert('Notification', 'Unable to check for updates at this time.');
                return;
            }
            const data = await res.json();
            const latestVersion = data.tag_name.replace('v', '');
            if (latestVersion !== CURRENT_VERSION && data.assets && data.assets.length > 0) {
                const apkAsset = data.assets.find(a => a.name.endsWith('.apk'));
                if (apkAsset) {
                    if (!isManual) {
                        const ignored = await AsyncStorage.getItem(`ignore_update_${latestVersion}`);
                        if (ignored === 'true') return;
                    }
                    setUpdateInfo({ version: latestVersion, url: apkAsset.browser_download_url });
                    setIgnoreUpdate(false);
                    setShowUpdateModal(true);
                } else if (isManual) {
                    Alert.alert('Notification', 'Update file not found.');
                }
            } else if (isManual) {
                Alert.alert('Notification', 'You are on the latest version!');
            }
        } catch (e) {
            console.log('Update check error:', e);
            if (isManual) Alert.alert('Error', 'Update check error: ' + e.message);
        } finally {
            if (isManual) setCheckingUpdate(false);
        }
    }

    async function downloadUpdate(url) {
        try {
            setLoading(true);
            const fileUri = FileSystem.documentDirectory + 'update.apk';
            const { uri } = await FileSystem.downloadAsync(url, fileUri);

            const contentUri = await FileSystem.getContentUriAsync(uri);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                type: 'application/vnd.android.package-archive'
            });
        } catch (e) {
            Alert.alert('Error', 'Unable to download update.\n' + e.message);
        } finally {
            setLoading(false);
        }
    }

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
            Alert.alert('✅ Success', `Imported ${arr.length} decks.`);
        } catch (e) {
            Alert.alert('Error', 'Invalid file or not decks.json.\n' + e.message);
        } finally {
            setLoading(false);
        }
    }

    function confirmClear() {
        Alert.alert('Delete all?', 'All decks will be deleted from the app.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await clearDecks(); setDecks([]); } },
        ]);
    }

    function renderDeck({ item }) {
        const cards = item.cards ?? [];
        const mc = cards.filter(c => c.question_type === 'multiple_choice').length;
        const date = item.created_at ? new Date(item.created_at).toLocaleDateString('en-US') : '';

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
                            {cards.length} cards  •  {mc} multiple choice
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
                    <Text style={styles.headerSub}>{decks.length} decks</Text>
                </View>
                {decks.length > 0 && (
                    <TouchableOpacity onPress={confirmClear} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Delete all</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Import button */}
            <TouchableOpacity style={styles.importBtn} onPress={importDecks} disabled={loading}>
                {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.importBtnText}>📂 Import decks.json</Text>
                }
            </TouchableOpacity>

            {/* Deck list */}
            {decks.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyIcon}>📭</Text>
                    <Text style={styles.emptyTitle}>No decks yet</Text>
                    <Text style={styles.emptyHint}>
                        Copy the decks.json file from your computer to your phone{'\n'}then tap "Import decks.json" above.
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

            {/* Floating Info Button */}
            <TouchableOpacity style={styles.fab} onPress={() => setShowInfoModal(true)}>
                <Text style={styles.fabText}>I</Text>
            </TouchableOpacity>

            {/* Info Modal */}
            <Modal visible={showInfoModal} transparent animationType="fade" onRequestClose={() => setShowInfoModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.infoModalContent}>
                        <Text style={styles.modalTitle}>App Information</Text>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Version:</Text>
                            <Text style={styles.infoValue}>v{CURRENT_VERSION}</Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Author:</Text>
                            <TouchableOpacity onPress={() => Linking.openURL('https://github.com/LHB16')}>
                                <Text style={styles.infoLink}>LHB16 (GitHub)</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Source code:</Text>
                            <TouchableOpacity onPress={() => Linking.openURL('https://github.com/LHB16/Flashcard-AI')}>
                                <Text style={styles.infoLink}>LHB16/Flashcard-AI</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.checkUpdateBtn}
                            onPress={() => {
                                setShowInfoModal(false);
                                checkUpdates(true);
                            }}
                            disabled={checkingUpdate}
                        >
                            <Text style={styles.checkUpdateBtnText}>
                                {checkingUpdate ? 'Checking...' : 'Check for updates'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.closeBtn} onPress={() => setShowInfoModal(false)}>
                            <Text style={styles.closeBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Update Modal */}
            <Modal visible={showUpdateModal} transparent animationType="fade" onRequestClose={() => setShowUpdateModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.updateModalContent}>
                        <Text style={styles.modalTitle}>New update!</Text>
                        <Text style={styles.updateMessage}>
                            Version v{updateInfo?.version} is available. Do you want to download and install it now?
                        </Text>

                        <TouchableOpacity
                            style={styles.checkboxRow}
                            onPress={() => setIgnoreUpdate(!ignoreUpdate)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.checkbox, ignoreUpdate && styles.checkboxActive]}>
                                {ignoreUpdate && <Text style={styles.checkboxCheck}>✓</Text>}
                            </View>
                            <Text style={styles.checkboxLabel}>Do not show this message again</Text>
                        </TouchableOpacity>

                        <View style={styles.updateBtnRow}>
                            <TouchableOpacity
                                style={[styles.updateActionBtn, { backgroundColor: Colors.border }]}
                                onPress={async () => {
                                    if (ignoreUpdate && updateInfo?.version) {
                                        await AsyncStorage.setItem(`ignore_update_${updateInfo.version}`, 'true');
                                    }
                                    setShowUpdateModal(false);
                                }}
                            >
                                <Text style={[styles.updateActionBtnText, { color: Colors.text }]}>Later</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.updateActionBtn, { backgroundColor: Colors.primary }]}
                                onPress={async () => {
                                    if (ignoreUpdate && updateInfo?.version) {
                                        await AsyncStorage.setItem(`ignore_update_${updateInfo.version}`, 'true');
                                    }
                                    setShowUpdateModal(false);
                                    downloadUpdate(updateInfo.url);
                                }}
                            >
                                <Text style={styles.updateActionBtnText}>Update now</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 5,
    },
    fabText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        fontFamily: 'serif',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    infoModalContent: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: 24,
        width: '100%',
        maxWidth: 380,
    },
    updateModalContent: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: 24,
        width: '100%',
        maxWidth: 380,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 20,
        textAlign: 'center',
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 14,
        alignItems: 'center',
    },
    infoLabel: {
        width: 90,
        fontSize: 15,
        color: Colors.textDim,
        fontWeight: '500',
    },
    infoValue: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        fontWeight: '600',
    },
    infoLink: {
        flex: 1,
        fontSize: 15,
        color: Colors.primary,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    checkUpdateBtn: {
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: Radius.md,
        alignItems: 'center',
        marginTop: 24,
        marginBottom: 12,
    },
    checkUpdateBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    closeBtn: {
        paddingVertical: 10,
        alignItems: 'center',
    },
    closeBtnText: {
        color: Colors.textDim,
        fontSize: 15,
        fontWeight: '600',
    },
    updateMessage: {
        fontSize: 15,
        color: Colors.text,
        lineHeight: 22,
        marginBottom: 20,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderWidth: 1.5,
        borderColor: Colors.textDim,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    checkboxActive: {
        borderColor: Colors.primary,
        backgroundColor: 'transparent',
    },
    checkboxCheck: {
        color: Colors.primary,
        fontSize: 15,
        fontWeight: 'bold',
    },
    checkboxLabel: {
        fontSize: 14,
        color: Colors.textDim,
    },
    updateBtnRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    updateActionBtn: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: Radius.md,
        minWidth: 100,
        alignItems: 'center',
    },
    updateActionBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
});
