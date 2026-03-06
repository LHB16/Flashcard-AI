// src/screens/DeckDetailScreen.js
import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Platform, StatusBar, Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { updateDeck, loadDecks } from '../utils/storage';
import { Colors, Spacing, Radius } from '../theme';

export default function DeckDetailScreen({ route, navigation }) {
    const [currentDeck, setCurrentDeck] = useState(route.params.deck);

    useFocusEffect(
        React.useCallback(() => {
            loadDecks().then(decks => {
                const found = decks.find(d => d.deck_id === currentDeck.deck_id);
                if (found) setCurrentDeck(found);
            });
        }, [currentDeck.deck_id])
    );

    const cards = currentDeck.cards ?? [];
    const mc = cards.filter(c => c.question_type === 'multiple_choice').length;
    const sc = cards.length - mc;

    const green = cards.filter(c => c.status === 2).length;
    const orange = cards.filter(c => c.status === 1).length;
    const gray = cards.filter(c => c.status === 0 || !c.status).length;

    const date = currentDeck.created_at
        ? new Date(currentDeck.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';

    function handleReset() {
        Alert.alert(
            "Xác nhận",
            "Bạn có chắc muốn đặt lại tiến độ học của bộ thẻ này? (Tất cả sẽ về trạng thái Chưa học)",
            [
                { text: "Huỷ", style: "cancel" },
                {
                    text: "Đặt lại", style: "destructive", onPress: async () => {
                        const updated = { ...currentDeck, cards: cards.map(c => ({ ...c, status: 0 })) };
                        await updateDeck(updated);
                        setCurrentDeck(updated);
                    }
                }
            ]
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={2}>{currentDeck.name}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                {/* Progress Bar */}
                {cards.length > 0 && (
                    <View style={styles.progressContainer}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.sectionTitleProg}>Tiến độ học tập</Text>
                            {(green > 0 || orange > 0) && (
                                <TouchableOpacity onPress={handleReset}>
                                    <Text style={styles.resetText}>🔄 Đặt lại</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.progressBar}>
                            {green > 0 && <View style={[styles.progressFill, { flex: green, backgroundColor: Colors.success, borderTopLeftRadius: 6, borderBottomLeftRadius: 6, borderTopRightRadius: orange + gray === 0 ? 6 : 0, borderBottomRightRadius: orange + gray === 0 ? 6 : 0 }]} />}
                            {orange > 0 && <View style={[styles.progressFill, { flex: orange, backgroundColor: Colors.warning, borderTopLeftRadius: green === 0 ? 6 : 0, borderBottomLeftRadius: green === 0 ? 6 : 0, borderTopRightRadius: gray === 0 ? 6 : 0, borderBottomRightRadius: gray === 0 ? 6 : 0 }]} />}
                            {gray > 0 && <View style={[styles.progressFill, { flex: gray, backgroundColor: Colors.border, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderTopLeftRadius: green + orange === 0 ? 6 : 0, borderBottomLeftRadius: green + orange === 0 ? 6 : 0 }]} />}
                        </View>
                        <View style={styles.progressLabels}>
                            <Text style={styles.progressLabel}>✅ {green}</Text>
                            <Text style={styles.progressLabel}>❌ {orange}</Text>
                            <Text style={styles.progressLabel}>⚪ {gray}</Text>
                        </View>
                    </View>
                )}

                {/* Stats */}
                <View style={styles.statsRow}>
                    <StatBox label="Tổng thẻ" value={cards.length} icon="🃏" />
                    <StatBox label="Đơn lựa chọn" value={sc} icon="🟢" />
                    <StatBox label="Đa lựa chọn" value={mc} icon="🔵" />
                </View>

                <View style={styles.infoBox}>
                    <InfoRow label="Ngày tạo" value={date} />
                    {currentDeck.description ? <InfoRow label="Mô tả" value={currentDeck.description} /> : null}
                    {currentDeck.source_folder ? <InfoRow label="Nguồn" value={currentDeck.source_folder} /> : null}
                </View>

                {/* Actions */}
                <Text style={styles.sectionTitle}>Chọn chế độ học</Text>

                <TouchableOpacity
                    style={[styles.modeBtn, { backgroundColor: Colors.primary }]}
                    onPress={() => navigation.navigate('Flashcard', { deck: currentDeck })}
                    disabled={cards.length === 0}
                >
                    <Text style={styles.modeIcon}>🃏</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.modeName}>Thẻ Nhớ</Text>
                        <Text style={styles.modeDesc}>Lật thẻ, tự đánh giá</Text>
                    </View>
                    <Text style={styles.modeArrow}>›</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.modeBtn, { backgroundColor: '#5B4FCF' }]}
                    onPress={() => navigation.navigate('Quiz', { deck: currentDeck })}
                    disabled={cards.length === 0}
                >
                    <Text style={styles.modeIcon}>📝</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.modeName}>Làm Bài Thi</Text>
                        <Text style={styles.modeDesc}>Trắc nghiệm đơn + đa, lưu tiến độ</Text>
                    </View>
                    <Text style={styles.modeArrow}>›</Text>
                </TouchableOpacity>

                {cards.length === 0 && (
                    <Text style={styles.noCards}>⚠ Bộ thẻ này không có câu hỏi nào.</Text>
                )}
            </ScrollView>
        </View>
    );
}

function StatBox({ label, value, icon }) {
    return (
        <View style={statStyles.box}>
            <Text style={statStyles.icon}>{icon}</Text>
            <Text style={statStyles.value}>{value}</Text>
            <Text style={statStyles.label}>{label}</Text>
        </View>
    );
}

function InfoRow({ label, value }) {
    return (
        <View style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <Text style={{ fontSize: 12, color: Colors.textDim, marginBottom: 2 }}>{label}</Text>
            <Text style={{ fontSize: 14, color: Colors.text }}>{value}</Text>
        </View>
    );
}

const statStyles = StyleSheet.create({
    box: {
        flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
        paddingVertical: 14, alignItems: 'center', marginHorizontal: 4,
        elevation: 2, shadowColor: '#000', shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
    },
    icon: { fontSize: 22 },
    value: { fontSize: 22, fontWeight: '800', color: Colors.primary, marginVertical: 2 },
    label: { fontSize: 11, color: Colors.textDim, textAlign: 'center' },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        backgroundColor: Colors.primary,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 50,
        paddingBottom: 16, paddingHorizontal: Spacing.md,
        flexDirection: 'row', alignItems: 'center',
    },
    back: { paddingRight: 12, paddingVertical: 4 },
    backText: { fontSize: 32, color: '#fff', lineHeight: 36 },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },
    body: { padding: Spacing.md, paddingBottom: 60 },
    statsRow: { flexDirection: 'row', marginBottom: Spacing.md },
    infoBox: {
        backgroundColor: Colors.surface, borderRadius: Radius.md,
        padding: Spacing.md, marginBottom: Spacing.lg,
        elevation: 1, shadowColor: '#000', shadowOpacity: 0.04,
        shadowRadius: 4,
    },
    sectionTitle: {
        fontSize: 13, fontWeight: '700', color: Colors.textDim,
        letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm,
    },
    modeBtn: {
        borderRadius: Radius.md, padding: Spacing.md,
        flexDirection: 'row', alignItems: 'center',
        marginBottom: Spacing.sm,
        elevation: 3, shadowColor: '#000', shadowOpacity: 0.12,
        shadowOffset: { width: 0, height: 3 }, shadowRadius: 6,
    },
    modeIcon: { fontSize: 28, marginRight: Spacing.md },
    modeName: { fontSize: 16, fontWeight: '700', color: '#fff' },
    modeDesc: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    modeArrow: { fontSize: 28, color: 'rgba(255,255,255,0.7)' },
    noCards: { textAlign: 'center', color: Colors.warning, marginTop: 16, fontSize: 14 },
    progressContainer: { marginBottom: Spacing.lg },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    sectionTitleProg: { fontSize: 13, fontWeight: '700', color: Colors.textDim, textTransform: 'uppercase' },
    resetText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
    progressBar: { flexDirection: 'row', height: 12, borderRadius: 6, backgroundColor: Colors.border, overflow: 'hidden', marginBottom: 8 },
    progressFill: { height: '100%' },
    progressLabels: { flexDirection: 'row', gap: 16 },
    progressLabel: { fontSize: 12, color: Colors.textDim, fontWeight: '600' },
});
