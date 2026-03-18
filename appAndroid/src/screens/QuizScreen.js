// src/screens/QuizScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Platform, StatusBar, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, Radius } from '../theme';
import { saveSession, loadSessions, deleteSession, updateDeck } from '../utils/storage';

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export default function QuizScreen({ route, navigation }) {
    const { deck } = route.params;
    const cards = deck.cards ?? [];

    const [order, setOrder] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [selected, setSelected] = useState([]);
    const [revealed, setRevealed] = useState(false);
    const [correct, setCorrect] = useState(0);
    const [wrong, setWrong] = useState(0);
    const [answers, setAnswers] = useState({});
    const [lastResult, setLastResult] = useState(null); // { isCorrect: bool, chosenLetters: [], correctLetters: [] }
    const [sessionLoaded, setSessionLoaded] = useState(false);

    useFocusEffect(useCallback(() => {
        async function init() {
            try {
                const sessions = await loadSessions();
                let saved = sessions[deck.deck_id];

                // Normalize Python format → Android format
                if (saved && saved.question_order && !saved.order) {
                    saved = {
                        order: saved.question_order,
                        currentIdx: saved.current_index ?? 0,
                        correct: saved.correct_count ?? 0,
                        wrong: saved.wrong_count ?? 0,
                        answers: saved.answers ?? {},
                    };
                }

                if (saved && Array.isArray(saved.order) && saved.order.length > 0
                    && typeof saved.currentIdx === 'number' && saved.currentIdx < saved.order.length) {
                    Alert.alert(
                        'Continue Quiz?',
                        `You left off at question ${saved.currentIdx + 1}/${saved.order.length}.`,
                        [
                            { text: 'Restart', onPress: startNew },
                            {
                                text: 'Continue', onPress: () => {
                                    setOrder(saved.order);
                                    setCurrentIdx(saved.currentIdx);
                                    setCorrect(saved.correct ?? 0);
                                    setWrong(saved.wrong ?? 0);
                                    setAnswers(saved.answers ?? {});
                                    setSessionLoaded(true);
                                }
                            },
                        ]
                    );
                } else {
                    startNew();
                }
            } catch (e) {
                console.warn('Quiz init error, starting new:', e);
                startNew();
            }
        }
        function startNew() {
            const newOrder = shuffle(cards.map((_, i) => i));
            setOrder(newOrder);
            setCurrentIdx(0);
            setCorrect(0);
            setWrong(0);
            setAnswers({});
            setSelected([]);
            setRevealed(false);
            setSessionLoaded(true);
        }
        init();
    }, [deck.deck_id]));

    useEffect(() => {
        setSelected([]);
        setRevealed(false);
    }, [currentIdx]);

    if (!sessionLoaded || order.length === 0) return null;

    // Done
    if (currentIdx >= order.length) {
        return <QuizDone correct={correct} wrong={wrong} total={order.length}
            onRestart={restart} onBack={() => { deleteSession(deck.deck_id); navigation.goBack(); }} />;
    }

    const card = cards[order[currentIdx]];
    const isMulti = card.question_type === 'multiple_choice';
    const n = order.length;

    // Detect if correct_answers uses letter format ["A"] or full-text format ["full answer"]
    const isLetterFmt = (card.correct_answers ?? []).length > 0 &&
        (card.correct_answers ?? []).every(a => a.trim().length === 1 && /^[A-Za-z]$/.test(a.trim()));

    function toggleOption(index) {
        if (revealed) return;
        if (isMulti) {
            setSelected(prev => prev.includes(index) ? prev.filter(x => x !== index) : [...prev, index]);
        } else {
            setSelected([index]);
        }
    }

    function confirm() {
        if (selected.length === 0) {
            Alert.alert('', 'You have not selected an answer!');
            return;
        }
        setRevealed(true);

        let isCorrect;
        if (isLetterFmt) {
            // correct_answers = ["A", "C"] — compare by letter
            const correctSet = new Set((card.correct_answers ?? []).map(a => a.trim().toUpperCase()));
            const chosenLetters = selected.map(idx => {
                const opt = (card.options[idx] ?? '').trim();
                return opt.length > 0 && /^[A-Za-z]/.test(opt[0]) && (opt.length === 1 || opt[1] === '.' || opt[1] === ')')
                    ? opt[0].toUpperCase()
                    : String.fromCharCode(65 + idx);
            });
            const chosenSet = new Set(chosenLetters);
            isCorrect = [...correctSet].every(x => chosenSet.has(x)) && [...chosenSet].every(x => correctSet.has(x));
        } else {
            // correct_answers = ["full text answer"] — compare by full text
            const correctSet = new Set((card.correct_answers ?? []).map(a => a.trim().toLowerCase()));
            const chosenTexts = selected.map(idx => (card.options[idx] ?? '').trim().toLowerCase());
            const chosenSet = new Set(chosenTexts);
            isCorrect = [...correctSet].every(x => chosenSet.has(x)) && [...chosenSet].every(x => correctSet.has(x));
        }

        setLastResult({ isCorrect });

        if (isCorrect) {
            setCorrect(c => c + 1);
            card.status = 2; // Green
        } else {
            setWrong(w => w + 1);
            card.status = 1; // Orange
        }
        updateDeck(deck).catch(() => { });

        const newAnswers = { ...answers, [card.card_id]: selected };
        setAnswers(newAnswers);
        saveSession(deck.deck_id, { order, currentIdx, correct: correct + (isCorrect ? 1 : 0), wrong: wrong + (isCorrect ? 0 : 1), answers: newAnswers });
    }

    function next() {
        const nextIdx = currentIdx + 1;
        setCurrentIdx(nextIdx);
        saveSession(deck.deck_id, { order, currentIdx: nextIdx, correct, wrong, answers });
        if (nextIdx >= order.length) deleteSession(deck.deck_id);
    }

    function confirmRestart() {
        Alert.alert(
            '🔄 Restart from beginning?',
            'Current progress will be lost.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Restart', style: 'destructive', onPress: restart },
            ]
        );
    }

    function restart() {
        const newOrder = shuffle(cards.map((_, i) => i));
        setOrder(newOrder);
        setCurrentIdx(0);
        setCorrect(0);
        setWrong(0);
        setAnswers({});
        setSelected([]);
        setRevealed(false);
        deleteSession(deck.deck_id);
    }

    const correctAnswers = card.correct_answers ?? [];
    const correctAnswerText = isLetterFmt
        ? correctAnswers.map(letter => {
            const opt = (card.options ?? []).find(o => o.trim().startsWith(letter + '.') || o.trim().startsWith(letter + ')'));
            return opt ?? letter;
        }).join('\n')
        : correctAnswers.join('\n');

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => { saveSession(deck.deck_id, { order, currentIdx, correct, wrong, answers }); navigation.goBack(); }} style={styles.back}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{deck.name}</Text>
                    <Text style={styles.headerSub}>Question {currentIdx + 1} / {n}</Text>
                </View>
                <View style={styles.scoreBadge}>
                    <Text style={{ color: Colors.success, fontWeight: '700', fontSize: 12 }}>✅{correct}</Text>
                    <Text style={{ color: Colors.danger, fontWeight: '700', fontSize: 12, marginLeft: 8 }}>❌{wrong}</Text>
                </View>
            </View>

            {/* Progress */}
            <View style={styles.progressBg}>
                <View style={[styles.progressFg, { width: `${(currentIdx / n) * 100}%` }]} />
            </View>

            {/* Body */}
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                {/* Type badge */}
                <View style={[styles.badge, { backgroundColor: isMulti ? '#FFF3CD' : '#D1FAE5' }]}>
                    <Text style={{ color: isMulti ? Colors.warning : Colors.success, fontSize: 12, fontWeight: '700' }}>
                        {isMulti ? '🔵 Select MULTIPLE answers' : '🟢 Select ONE answer'}
                    </Text>
                </View>

                {/* Question */}
                <Text style={styles.question}>{card.question}</Text>

                {/* Options */}
                {(card.options ?? []).map((opt, i) => {
                    const label = String.fromCharCode(65 + i);
                    // Check if this option is a correct answer
                    let isCorrectOpt;
                    if (isLetterFmt) {
                        // Extract the letter prefix from option text (e.g. "A" from "A. 255")
                        const optText = opt.trim();
                        const optLetter = (optText.length > 0 && /^[A-Za-z]/.test(optText[0]) && (optText.length === 1 || optText[1] === '.' || optText[1] === ')'))
                            ? optText[0].toUpperCase() : label;
                        isCorrectOpt = correctAnswers.some(a => a.trim().toUpperCase() === optLetter);
                    } else {
                        isCorrectOpt = correctAnswers.some(a => a.trim().toLowerCase() === opt.trim().toLowerCase());
                    }
                    const isSelected = selected.includes(i);
                    let bg = Colors.surface;
                    let borderColor = Colors.border;
                    let textColor = Colors.text;
                    if (revealed) {
                        if (isCorrectOpt) { bg = '#D1FAE5'; borderColor = Colors.success; textColor = Colors.success; }
                        else if (isSelected) { bg = '#FEE2E2'; borderColor = Colors.danger; textColor = Colors.danger; }
                    } else if (isSelected) {
                        bg = Colors.primaryLight; borderColor = Colors.primary; textColor = Colors.primary;
                    }
                    return (
                        <TouchableOpacity
                            key={i}
                            style={[styles.option, { backgroundColor: bg, borderColor }]}
                            onPress={() => toggleOption(i)}
                            activeOpacity={revealed ? 1 : 0.7}
                        >
                            <View style={[styles.optLetter, { borderColor, backgroundColor: isSelected || (revealed && isCorrectOpt) ? borderColor : 'transparent' }]}>
                                <Text style={{ fontWeight: '700', color: (isSelected || (revealed && isCorrectOpt)) ? '#fff' : Colors.textDim, fontSize: 13 }}>{label}</Text>
                            </View>
                            <Text style={[styles.optText, { color: textColor }]}>{opt.replace(/^[A-Za-z][.)]\s*/, '')}</Text>
                        </TouchableOpacity>
                    );
                })}

                {/* Feedback */}
                {revealed && lastResult && (
                    <View style={[styles.feedback, {
                        backgroundColor: lastResult.isCorrect ? '#D1FAE5' : '#FEE2E2'
                    }]}>
                        <Text style={{ fontWeight: '700', fontSize: 15, color: lastResult.isCorrect ? Colors.success : Colors.danger }}>
                            {lastResult.isCorrect ? '✅ Correct!' : '❌ Incorrect!'}
                        </Text>
                        {!lastResult.isCorrect && (
                            <Text style={{ color: Colors.success, marginTop: 6, fontSize: 13 }}>Correct answer: {correctAnswerText}</Text>
                        )}
                        {card.notes ? <Text style={{ color: Colors.warning, marginTop: 4, fontSize: 12, fontStyle: 'italic' }}>{card.notes}</Text> : null}
                    </View>
                )}
            </ScrollView>

            {/* Footer action bar */}
            <View style={styles.footer}>
                {!revealed ? (
                    <TouchableOpacity style={[styles.footerBtn, { backgroundColor: Colors.primary }]} onPress={confirm}>
                        <Text style={styles.footerBtnText}>✔ Confirm</Text>
                    </TouchableOpacity>
                ) : currentIdx + 1 < n ? (
                    <TouchableOpacity style={[styles.footerBtn, { backgroundColor: Colors.success }]} onPress={next}>
                        <Text style={styles.footerBtnText}>Next →</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={[styles.footerBtn, { backgroundColor: Colors.success }]} onPress={next}>
                        <Text style={styles.footerBtnText}>🏁 View Results</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.footerBtnSmall, { backgroundColor: '#FEF3C7', marginLeft: 8 }]} onPress={confirmRestart}>
                    <Text style={{ fontSize: 15 }}>🔄</Text>
                    <Text style={[styles.footerBtnSmallText, { color: '#92400E' }]}>Reset</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function QuizDone({ correct, wrong, total, onRestart, onBack }) {
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
        <View style={{ flex: 1, backgroundColor: Colors.bg }}>
            <View style={[styles.header, { paddingBottom: 16 }]}>
                <TouchableOpacity onPress={onBack} style={styles.back}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Quiz Results</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <Text style={{ fontSize: 72, marginBottom: 8 }}>{pct >= 70 ? '🎉' : pct >= 50 ? '😐' : '😓'}</Text>
                <Text style={{ fontSize: 64, fontWeight: '900', color: pct >= 70 ? Colors.success : pct >= 50 ? Colors.warning : Colors.danger }}>{pct}%</Text>
                <Text style={{ fontSize: 16, color: Colors.textDim, marginTop: 8 }}>✅ Correct: {correct}  ❌ Incorrect: {wrong}  📋 Total: {total}</Text>
                <TouchableOpacity style={[styles.footerBtn, { backgroundColor: Colors.primary, marginTop: 32, width: '100%' }]} onPress={onRestart}>
                    <Text style={styles.footerBtnText}>🔄 Restart</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.footerBtn, { backgroundColor: Colors.surface2, marginTop: 10, width: '100%' }]} onPress={onBack}>
                    <Text style={[styles.footerBtnText, { color: Colors.text }]}>← Go back</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: {
        backgroundColor: Colors.primary,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 50,
        paddingBottom: 12, paddingHorizontal: Spacing.md,
        flexDirection: 'row', alignItems: 'center',
    },
    back: { paddingRight: 10 },
    backText: { fontSize: 32, color: '#fff', lineHeight: 36 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
    scoreBadge: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5 },
    progressBg: { height: 4, backgroundColor: Colors.surface2 },
    progressFg: { height: 4, backgroundColor: Colors.primary },
    body: { padding: Spacing.md, paddingBottom: 20 },
    badge: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 12 },
    question: { fontSize: 16, fontWeight: '600', color: Colors.text, lineHeight: 26, marginBottom: 16 },
    option: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: Radius.md, borderWidth: 1.5,
        padding: 12, marginBottom: 8,
    },
    optLetter: {
        width: 28, height: 28, borderRadius: 14,
        borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 10,
    },
    optText: { flex: 1, fontSize: 14, lineHeight: 22 },
    feedback: {
        borderRadius: Radius.md, padding: 14, marginTop: 12,
    },
    footer: {
        flexDirection: 'row', padding: Spacing.md,
        paddingBottom: Platform.OS === 'android' ? 20 : 30,
        backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border,
    },
    footerBtn: {
        flex: 1, paddingVertical: 14, borderRadius: Radius.md,
        alignItems: 'center', elevation: 2,
    },
    footerBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    footerBtnSmall: {
        width: 72, paddingVertical: 10, borderRadius: Radius.md,
        alignItems: 'center', justifyContent: 'center', elevation: 1,
    },
    footerBtnSmallText: { fontSize: 11, fontWeight: '700', marginTop: 2 },
});
