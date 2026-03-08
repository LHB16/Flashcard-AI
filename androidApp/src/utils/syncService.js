import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadDecks, loadSessions } from './storage';
import { listAppDataFiles, downloadFromDrive, uploadToDrive } from './googleDrive';

const DECKS_KEY = 'flashcard_decks';
const SESSIONS_KEY = 'quiz_sessions';

export async function performSync(accessToken) {
    if (!accessToken) throw new Error("Not authenticated");

    try {
        // 1. Find remote files
        const files = await listAppDataFiles(accessToken);
        const remoteDecksFile = files.find(f => f.name === 'decks.json');
        const remoteSessionsFile = files.find(f => f.name === 'quiz_sessions.json');

        // ==== SYNC DECKS ====
        let remoteDecks = [];
        if (remoteDecksFile) {
            const data = await downloadFromDrive(remoteDecksFile.id, accessToken);
            if (Array.isArray(data)) remoteDecks = data;
        }

        const localDecks = await loadDecks();
        const localDecksMap = Object.fromEntries(localDecks.map(d => [d.deck_id, d]));

        const mergedDecksMap = {};

        // Merge remote
        for (const rd of remoteDecks) {
            const rdId = rd.deck_id;
            const rdUpdated = rd.updated_at || '';

            if (localDecksMap[rdId]) {
                const ld = localDecksMap[rdId];
                const ldUpdated = ld.updated_at || '';

                if (rdUpdated > ldUpdated) {
                    // Mẹo giữ nguyên local image_path cho Android (tránh bị chép đè đường dẫn hình trống nếu remote k có)
                    const rdCardsCopy = rd.cards.map(rc => {
                        const lc = ld.cards.find(c => c.card_id === rc.card_id);
                        if (lc && lc.image_path) rc.image_path = lc.image_path;
                        return rc;
                    });
                    mergedDecksMap[rdId] = { ...rd, cards: rdCardsCopy };
                } else {
                    mergedDecksMap[rdId] = ld;
                }
            } else {
                mergedDecksMap[rdId] = rd;
            }
        }

        // Add remaining local
        for (const ldId in localDecksMap) {
            if (!mergedDecksMap[ldId]) mergedDecksMap[ldId] = localDecksMap[ldId];
        }

        const mergedDecks = Object.values(mergedDecksMap);

        // Save merged decks locally bypass updated_at injected timestamp
        await AsyncStorage.setItem(DECKS_KEY, JSON.stringify(mergedDecks));
        // Push merged decks to drive
        await uploadToDrive('decks.json', mergedDecks, remoteDecksFile ? remoteDecksFile.id : null, accessToken);


        // ==== SYNC SESSIONS ====
        let remoteSessions = {};
        if (remoteSessionsFile) {
            const data = await downloadFromDrive(remoteSessionsFile.id, accessToken);
            if (data && typeof data === 'object') remoteSessions = data;
        }

        const localSessions = await loadSessions();
        const mergedSessions = {};

        const allDeckIds = new Set([...Object.keys(remoteSessions), ...Object.keys(localSessions)]);

        for (const deckId of allDeckIds) {
            const hasRemote = !!remoteSessions[deckId];
            const hasLocal = !!localSessions[deckId];

            if (hasRemote && hasLocal) {
                const rs = remoteSessions[deckId];
                const ls = localSessions[deckId];
                const rsUpdated = rs.updated_at || '';
                const lsUpdated = ls.updated_at || '';
                mergedSessions[deckId] = (rsUpdated > lsUpdated) ? rs : ls;
            } else if (hasRemote) {
                mergedSessions[deckId] = remoteSessions[deckId];
            } else {
                mergedSessions[deckId] = localSessions[deckId];
            }
        }

        // Save merged sessions locally
        await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(mergedSessions));
        // Push to drive
        await uploadToDrive('quiz_sessions.json', mergedSessions, remoteSessionsFile ? remoteSessionsFile.id : null, accessToken);

        return { success: true, message: 'Sync successful!' };
    } catch (e) {
        console.error("Sync error:", e);
        return { success: false, message: e.message };
    }
}
