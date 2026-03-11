// src/utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const DECKS_KEY = 'flashcard_decks';

export async function saveDecks(decks) {
  const timestamp = new Date().toISOString();
  const processedDecks = decks.map(d => ({
    ...d,
    updated_at: d.updated_at || timestamp
  }));
  await AsyncStorage.setItem(DECKS_KEY, JSON.stringify(processedDecks));
}

export async function loadDecks() {
  const raw = await AsyncStorage.getItem(DECKS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearDecks() {
  await AsyncStorage.removeItem(DECKS_KEY);
}

export async function updateDeck(updatedDeck) {
  const decks = await loadDecks();
  const idx = decks.findIndex(d => d.deck_id === updatedDeck.deck_id);
  if (idx !== -1) {
    updatedDeck.updated_at = new Date().toISOString();
    decks[idx] = updatedDeck;
    await saveDecks(decks);
  }
}

// Quiz session storage
const SESSIONS_KEY = 'quiz_sessions';

export async function loadSessions() {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function saveSession(deckId, session, skipTimestamp = false) {
  const sessions = await loadSessions();
  if (!skipTimestamp) {
    session.updated_at = new Date().toISOString();
  }
  sessions[deckId] = session;
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function deleteSession(deckId) {
  const sessions = await loadSessions();
  delete sessions[deckId];
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}
