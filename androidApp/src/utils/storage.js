// src/utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const DECKS_KEY = 'flashcard_decks';

export async function saveDecks(decks) {
  await AsyncStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

export async function loadDecks() {
  const raw = await AsyncStorage.getItem(DECKS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearDecks() {
  await AsyncStorage.removeItem(DECKS_KEY);
}

// Quiz session storage
const SESSIONS_KEY = 'quiz_sessions';

export async function loadSessions() {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function saveSession(deckId, session) {
  const sessions = await loadSessions();
  sessions[deckId] = session;
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function deleteSession(deckId) {
  const sessions = await loadSessions();
  delete sessions[deckId];
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}
