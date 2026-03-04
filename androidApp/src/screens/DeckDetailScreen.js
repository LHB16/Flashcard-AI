// src/screens/DeckDetailScreen.js
import React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Platform, StatusBar,
} from 'react-native';
import { Colors, Spacing, Radius } from '../theme';

export default function DeckDetailScreen({ route, navigation }) {
    const { deck } = route.params;
    const cards = deck.cards ?? [];
    const mc = cards.filter(c => c.question_type === 'multiple_choice').length;
    const sc = cards.length - mc;
    const date = deck.created_at
        ? new Date(deck.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={2}>{deck.name}</Text>
            </View>

            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                {/* Stats */}
                <View style={styles.statsRow}>
                    <StatBox label="Tổng thẻ" value={cards.length} icon="🃏" />
                    <StatBox label="Đơn lựa chọn" value={sc} icon="🟢" />
                    <StatBox label="Đa lựa chọn" value={mc} icon="🔵" />
                </View>

                <View style={styles.infoBox}>
                    <InfoRow label="Ngày tạo" value={date} />
                    {deck.description ? <InfoRow label="Mô tả" value={deck.description} /> : null}
                    {deck.source_folder ? <InfoRow label="Nguồn" value={deck.source_folder} /> : null}
                </View>

                {/* Actions */}
                <Text style={styles.sectionTitle}>Chọn chế độ học</Text>

                <TouchableOpacity
                    style={[styles.modeBtn, { backgroundColor: Colors.primary }]}
                    onPress={() => navigation.navigate('Flashcard', { deck })}
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
                    onPress={() => navigation.navigate('Quiz', { deck })}
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
});
