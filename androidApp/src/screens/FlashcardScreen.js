// src/screens/FlashcardScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, Platform, StatusBar, ScrollView,
    PanResponder, Dimensions,
} from 'react-native';
import { Colors, Spacing, Radius } from '../theme';
import { updateDeck } from '../utils/storage';

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_W * 0.30;
const VELOCITY_THR = 1.2;

export default function FlashcardScreen({ route, navigation }) {
    const { deck } = route.params;
    const cards = deck.cards ?? [];

    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [known, setKnown] = useState(0);
    const [unknown, setUnknown] = useState(0);
    const [done, setDone] = useState(false);
    const [canUndo, setCanUndo] = useState(false);

    const indexRef = useRef(0);
    const knownRef = useRef(0);
    const unknownRef = useRef(0);
    const historyRef = useRef([]);
    const flipRef = useRef(false);

    // Initialize progress on mount
    useEffect(() => {
        if (!cards.length) return;

        // Count existing known (green) and unknown (orange)
        const currentKnown = cards.filter(c => c.status === 2).length;
        const currentUnknown = cards.filter(c => c.status === 1).length;

        setKnown(currentKnown);
        knownRef.current = currentKnown;

        setUnknown(currentUnknown);
        unknownRef.current = currentUnknown;

        // Find the first unseen card (status is 0 or undefined)
        const nextIndex = cards.findIndex(c => !c.status || c.status === 0);

        if (nextIndex === -1 && cards.length > 0) {
            // All cards are seen, show results immediately
            setDone(true);
        } else if (nextIndex > 0) {
            // Resume from the next unseen card
            setIndex(nextIndex);
            indexRef.current = nextIndex;
        }
    }, [deck.deck_id]);

    const swipeX = useRef(new Animated.Value(0)).current;
    const swipeY = useRef(new Animated.Value(0)).current;
    const flipAnim = useRef(new Animated.Value(0)).current;
    const cardOpacity = useRef(new Animated.Value(1)).current;

    const cardRotate = swipeX.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ['-18deg', '0deg', '18deg'] });
    const rightOverlay = swipeX.interpolate({ inputRange: [20, 90], outputRange: [0, 1], extrapolate: 'clamp' });
    const leftOverlay = swipeX.interpolate({ inputRange: [-90, -20], outputRange: [1, 0], extrapolate: 'clamp' });
    const frontRotateY = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
    const backRotateY = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
    const leftUnderline = swipeX.interpolate({ inputRange: [-SWIPE_THRESHOLD - 5, -SWIPE_THRESHOLD + 5], outputRange: [1, 0], extrapolate: 'clamp' });
    const rightUnderline = swipeX.interpolate({ inputRange: [SWIPE_THRESHOLD - 5, SWIPE_THRESHOLD + 5], outputRange: [0, 1], extrapolate: 'clamp' });

    function doFlip() {
        const next = !flipRef.current;
        flipRef.current = next;
        setFlipped(next);
        Animated.spring(flipAnim, { toValue: next ? 1 : 0, friction: 8, tension: 10, useNativeDriver: false }).start();
    }

    function advanceCard(wasKnown) {
        const prevIndex = indexRef.current;
        const toX = wasKnown ? SCREEN_W * 1.5 : -SCREEN_W * 1.5;
        Animated.timing(swipeX, { toValue: toX, duration: 200, useNativeDriver: false }).start(() => {
            const oldStatus = cards[prevIndex].status || 0;
            historyRef.current.push({ index: prevIndex, wasKnown, oldStatus });
            setCanUndo(true);

            if (wasKnown) {
                knownRef.current++; setKnown(knownRef.current);
                cards[prevIndex].status = 2; // Green
            } else {
                unknownRef.current++; setUnknown(unknownRef.current);
                cards[prevIndex].status = 1; // Orange
            }
            // Background save
            updateDeck(deck).catch(() => { });

            const nextIndex = indexRef.current + 1;
            indexRef.current = nextIndex;
            cardOpacity.setValue(0);
            swipeX.setValue(0); swipeY.setValue(0); flipAnim.setValue(0);
            flipRef.current = false;
            if (nextIndex >= cards.length) {
                cardOpacity.setValue(1);
                setDone(true);
            } else {
                setFlipped(false);
                setIndex(nextIndex);
                setTimeout(() => cardOpacity.setValue(1), 40);
            }
        });
    }

    function undo() {
        if (!historyRef.current.length) return;
        const last = historyRef.current.pop();
        if (last.wasKnown) { knownRef.current--; setKnown(knownRef.current); }
        else { unknownRef.current--; setUnknown(unknownRef.current); }

        cards[last.index].status = last.oldStatus; // restore status
        updateDeck(deck).catch(() => { });

        indexRef.current = last.index;
        flipRef.current = false;
        cardOpacity.setValue(0);
        swipeX.setValue(0); swipeY.setValue(0); flipAnim.setValue(0);
        setDone(false); setFlipped(false);
        setIndex(last.index);
        setCanUndo(historyRef.current.length > 0);
        setTimeout(() => cardOpacity.setValue(1), 40);
    }

    // ── PanResponder ──────────────────────────────────────────────────────
    // onStartShouldSetPanResponder: false → lets ScrollView handle vertical scroll
    // onMoveShouldSetPanResponder: only captures clearly horizontal swipes
    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => {
            // Capture horizontal-dominant movement past dead zone
            const adx = Math.abs(g.dx), ady = Math.abs(g.dy);
            return adx > 12 && adx > ady * 1.5;
        },
        onMoveShouldSetPanResponderCapture: (_, g) => {
            const adx = Math.abs(g.dx), ady = Math.abs(g.dy);
            return adx > 12 && adx > ady * 1.5;
        },
        onPanResponderGrant: () => {
            swipeX.stopAnimation();
            swipeY.stopAnimation();
        },
        onPanResponderMove: (_, g) => {
            swipeX.setValue(g.dx);
            swipeY.setValue(g.dy * 0.10);
        },
        onPanResponderRelease: (_, g) => {
            const isRight = g.dx > SWIPE_THRESHOLD || g.vx > VELOCITY_THR;
            const isLeft = g.dx < -SWIPE_THRESHOLD || g.vx < -VELOCITY_THR;
            if (isRight) advanceCard(true);
            else if (isLeft) advanceCard(false);
            else {
                Animated.parallel([
                    Animated.spring(swipeX, { toValue: 0, friction: 6, tension: 50, useNativeDriver: false }),
                    Animated.spring(swipeY, { toValue: 0, friction: 6, tension: 50, useNativeDriver: false }),
                ]).start();
            }
        },
        onPanResponderTerminate: () => {
            Animated.parallel([
                Animated.spring(swipeX, { toValue: 0, friction: 6, tension: 50, useNativeDriver: false }),
                Animated.spring(swipeY, { toValue: 0, friction: 6, tension: 50, useNativeDriver: false }),
            ]).start();
        },
    })).current;

    function restart() {
        cards.forEach(c => c.status = 0);
        updateDeck(deck).catch(() => { });
        indexRef.current = 0; knownRef.current = 0; unknownRef.current = 0;
        historyRef.current = []; flipRef.current = false;
        swipeX.setValue(0); swipeY.setValue(0); flipAnim.setValue(0); cardOpacity.setValue(1);
        setIndex(0); setFlipped(false); setKnown(0); setUnknown(0); setDone(false); setCanUndo(false);
    }

    // ── Result screen ──────────────────────────────────────────────────────
    if (done || cards.length === 0) {
        const total = known + unknown;
        const pct = total > 0 ? Math.round((known / total) * 100) : 0;
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                        <Text style={styles.backText}>‹</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Kết quả</Text>
                </View>
                <View style={styles.resultBox}>
                    <Text style={{ fontSize: 64 }}>{pct >= 70 ? '🎉' : pct >= 50 ? '😐' : '😓'}</Text>
                    <Text style={[styles.pct, { color: pct >= 70 ? Colors.success : pct >= 50 ? Colors.warning : Colors.danger }]}>{pct}%</Text>
                    <Text style={styles.resultSub}>✅ Biết: {known}  ❌ Chưa biết: {unknown}</Text>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.primary, marginTop: 24 }]} onPress={restart}>
                        <Text style={styles.btnText}>🔄 Học lại</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: Colors.surface2, marginTop: 10 }]} onPress={() => navigation.goBack()}>
                        <Text style={[styles.btnText, { color: Colors.text }]}>← Quay lại</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const card = cards[index];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{deck.name}</Text>
                <Text style={styles.counter}>{index + 1}/{cards.length}</Text>
            </View>

            {/* Progress */}
            <View style={styles.progressBg}>
                <View style={[styles.progressFg, { width: `${((index + 1) / cards.length) * 100}%` }]} />
            </View>

            {/* Score */}
            <View style={styles.statsRow}>
                <View style={styles.scorePill}>
                    <Text style={styles.scoreEmoji}>❌</Text>
                    <Text style={[styles.scoreNum, { color: Colors.danger }]}>{unknown}</Text>
                </View>
                <Text style={{ color: Colors.textDim, fontSize: 11, fontStyle: 'italic' }}>← Chưa biết  /  Biết rồi →</Text>
                <View style={styles.scorePill}>
                    <Text style={[styles.scoreNum, { color: Colors.success }]}>{known}</Text>
                    <Text style={styles.scoreEmoji}>✅</Text>
                </View>
            </View>

            {/* Card */}
            <View style={styles.cardArea}>
                <Animated.View
                    {...panResponder.panHandlers}
                    style={[styles.cardWrap, {
                        opacity: cardOpacity,
                        transform: [{ translateX: swipeX }, { translateY: swipeY }, { rotate: cardRotate }],
                    }]}
                >
                    {/* Overlays */}
                    <Animated.View style={[styles.overlay, styles.overlayRight, { opacity: rightOverlay }]}>
                        <Text style={styles.overlayText}>✅ Biết rồi!</Text>
                    </Animated.View>
                    <Animated.View style={[styles.overlay, styles.overlayLeft, { opacity: leftOverlay }]}>
                        <Text style={styles.overlayText}>❌ Chưa biết</Text>
                    </Animated.View>

                    {/* Front */}
                    <Animated.View
                        pointerEvents={flipped ? "none" : "auto"}
                        style={[styles.flashcard, styles.cardFront, { transform: [{ rotateY: frontRotateY }] }]}>
                        <Text style={styles.cardSide}>CÂU HỎI</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                            style={{ flex: 1, width: '100%' }}
                            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                        >
                            <Text style={styles.questionText}>{card.question}</Text>
                            {card.options?.length > 0 && (
                                <View style={{ marginTop: 12 }}>
                                    {card.options.map((opt, i) => <Text key={i} style={styles.optionText}>{opt}</Text>)}
                                </View>
                            )}
                        </ScrollView>
                        {/* Tap button at the bottom — separate from swipe area, expanded touch area */}
                        <TouchableOpacity onPress={doFlip} style={styles.flipBtn}>
                            <Text style={styles.flipBtnText}>Nhấn để xem đáp án 👆</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Back */}
                    <Animated.View
                        pointerEvents={flipped ? "auto" : "none"}
                        style={[styles.flashcard, styles.cardBack, { transform: [{ rotateY: backRotateY }] }]}>
                        <Text style={[styles.cardSide, { color: Colors.success }]}>ĐÁP ÁN</Text>
                        <ScrollView
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                            style={{ flex: 1, width: '100%' }}
                            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                        >
                            <Text style={styles.answerText}>{getAnswerText(card)}</Text>
                            {card.notes ? <Text style={styles.noteText}>{card.notes}</Text> : null}
                        </ScrollView>
                        <TouchableOpacity onPress={doFlip} style={styles.flipBtn}>
                            <Text style={styles.flipBtnText}>Nhấn để lật lại 👆</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
            </View>

            {/* Bottom bar */}
            <View style={styles.hintBar}>
                <View style={[styles.hintBtn, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={{ fontSize: 24 }}>❌</Text>
                    <Animated.View style={[styles.underline, { backgroundColor: Colors.danger, opacity: leftUnderline }]} />
                </View>
                <TouchableOpacity
                    style={[styles.undoBtn, { opacity: canUndo ? 1 : 0.3 }]}
                    onPress={undo}
                    disabled={!canUndo}
                >
                    <Text style={{ fontSize: 24 }}>↩️</Text>
                </TouchableOpacity>
                <View style={[styles.hintBtn, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={{ fontSize: 24 }}>✅</Text>
                    <Animated.View style={[styles.underline, { backgroundColor: Colors.success, opacity: rightUnderline }]} />
                </View>
            </View>
        </View>
    );
}

function getAnswerText(card) {
    if (!card.correct_answers?.length) return '—';
    return card.correct_answers.map(letter => {
        const opt = (card.options ?? []).find(
            o => o.trim().startsWith(letter + '.') || o.trim().startsWith(letter + ')')
        );
        return opt ?? letter;
    }).join('\n');
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        backgroundColor: Colors.primary,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 50,
        paddingBottom: 12, paddingHorizontal: Spacing.md,
        flexDirection: 'row', alignItems: 'center',
    },
    back: { paddingRight: 12, paddingVertical: 4 },
    backText: { fontSize: 30, color: '#fff', fontWeight: '300' },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
    counter: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
    progressBg: { height: 4, backgroundColor: Colors.surface2 },
    progressFg: { height: 4, backgroundColor: Colors.primary },
    statsRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: Spacing.lg, paddingVertical: 8,
        backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    scorePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    scoreEmoji: { fontSize: 18 },
    scoreNum: { fontSize: 20, fontWeight: '800' },
    cardArea: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' },
    cardWrap: { width: '100%', height: '100%', maxHeight: 460 },
    flashcard: {
        position: 'absolute', width: '100%', height: '100%',
        borderRadius: Radius.lg, padding: Spacing.lg,
        backfaceVisibility: 'hidden',
        elevation: 5, shadowColor: '#000',
        shadowOpacity: 0.12, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12,
    },
    cardFront: { backgroundColor: Colors.surface },
    cardBack: { backgroundColor: '#F0FDF4' },
    overlay: {
        position: 'absolute', zIndex: 20, top: 18,
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: Radius.md, borderWidth: 3,
    },
    overlayRight: { left: 14, backgroundColor: 'rgba(209,250,229,0.92)', borderColor: Colors.success },
    overlayLeft: { right: 14, backgroundColor: 'rgba(254,226,226,0.92)', borderColor: Colors.danger },
    overlayText: { fontSize: 15, fontWeight: '800' },
    cardSide: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: Colors.primary, textTransform: 'uppercase', marginBottom: 12 },
    questionText: { fontSize: 16, fontWeight: '600', color: Colors.text, lineHeight: 26 },
    optionText: { fontSize: 13, color: Colors.textDim, marginVertical: 3 },
    answerText: { fontSize: 16, fontWeight: '700', color: Colors.success, lineHeight: 26 },
    noteText: { fontSize: 12, color: Colors.warning, marginTop: 10, fontStyle: 'italic' },
    flipBtn: {
        borderTopWidth: 1, borderTopColor: Colors.border,
        paddingTop: 16, paddingBottom: 8, marginTop: 8,
        alignItems: 'center', justifyContent: 'center',
        width: '100%',
    },
    flipBtnText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
    hintBar: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: Spacing.md, paddingVertical: 10,
        paddingBottom: Platform.OS === 'android' ? 18 : 28,
        gap: Spacing.sm, backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    hintBtn: {
        flex: 1, borderRadius: Radius.md, paddingVertical: 10,
        alignItems: 'center', elevation: 1,
    },
    underline: { height: 3, width: 28, borderRadius: 2, marginTop: 4 },
    undoBtn: {
        width: 56, alignItems: 'center', justifyContent: 'center',
        backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: 10,
    },
    resultBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    pct: { fontSize: 60, fontWeight: '900', marginVertical: 10 },
    resultSub: { fontSize: 15, color: Colors.textDim, marginTop: 4 },
    btn: { width: '100%', padding: 14, borderRadius: Radius.md, alignItems: 'center', elevation: 1 },
    btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
