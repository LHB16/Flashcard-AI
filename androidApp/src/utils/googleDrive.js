const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export async function listAppDataFiles(accessToken) {
    const url = `${DRIVE_API_URL}?spaces=appDataFolder&fields=files(id,name)&q=name='decks.json' or name='quiz_sessions.json'`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error(`List files error: ${res.status}`);
    const data = await res.json();
    return data.files || [];
}

export async function downloadFromDrive(fileId, accessToken) {
    const url = `${DRIVE_API_URL}/${fileId}?alt=media`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`Download error: ${res.status}`);
    }
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export async function uploadToDrive(fileName, content, existingFileId, accessToken) {
    let fileId = existingFileId;

    if (!fileId) {
        const metaRes = await fetch(DRIVE_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: fileName, parents: ['appDataFolder'] })
        });
        if (!metaRes.ok) throw new Error(`Create metadata error: ${metaRes.status}`);
        const meta = await metaRes.json();
        fileId = meta.id;
    }

    const jsonString = JSON.stringify(content, null, 2);
    const uploadRes = await fetch(`${UPLOAD_API_URL}/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: jsonString
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Upload error: ${uploadRes.status} - ${err}`);
    }
    return await uploadRes.json();
}
