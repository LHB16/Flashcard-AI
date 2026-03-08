import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = '900559674142-opri1224fsh2m708l2g2fd0bv1vkhnge.apps.googleusercontent.com';
const WEB_CLIENT_ID = '900559674142-p5j9infji8213r5b40m69rpkte5aog5o.apps.googleusercontent.com';
const TOKEN_STORAGE_KEY = 'google_drive_auth_token';
const EMAIL_STORAGE_KEY = 'google_drive_user_email';

export function useGoogleAuth() {
    const [accessToken, setAccessToken] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [isRestoring, setIsRestoring] = useState(true);

    // Xác định Redirect URI khớp chính xác với scheme đã đăng ký trong AndroidManifest
    const redirectUri = makeRedirectUri({
        scheme: `com.googleusercontent.apps.900559674142-opri1224fsh2m708l2g2fd0bv1vkhnge`,
    });

    const [request, response, promptAsync] = Google.useAuthRequest({
        androidClientId: IOS_CLIENT_ID,
        iosClientId: IOS_CLIENT_ID,
        webClientId: WEB_CLIENT_ID,
        redirectUri,
        scopes: [
            'https://www.googleapis.com/auth/drive.appdata',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    });

    useEffect(() => {
        if (request) {
            console.log('--- DATA FOR DEBUG ---');
            console.log('Redirect URI being sent to Google:', request.redirectUri);
            console.log('--- END DEBUG ---');
        }
    }, [request]);

    useEffect(() => {
        restoreToken();
    }, []);

    useEffect(() => {
        if (response?.type === 'success') {
            const { authentication } = response;
            if (authentication?.accessToken) {
                handleNewToken(authentication.accessToken);
            }
        }
    }, [response]);

    async function restoreToken() {
        try {
            setIsRestoring(true);
            const savedToken = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
            const savedEmail = await AsyncStorage.getItem(EMAIL_STORAGE_KEY);
            if (savedToken) {
                setAccessToken(savedToken);
                setUserEmail(savedEmail);
                // Background verify
                fetchUserInfo(savedToken);
            }
        } catch (e) {
            console.error('Error restoring token', e);
        } finally {
            setIsRestoring(false);
        }
    }

    async function handleNewToken(token) {
        setAccessToken(token);
        await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
        await fetchUserInfo(token);
    }

    async function fetchUserInfo(token) {
        try {
            const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUserEmail(data.email);
                await AsyncStorage.setItem(EMAIL_STORAGE_KEY, data.email);
            } else if (res.status === 401) {
                logout();
            }
        } catch (e) {
            console.error('Fetch user info error:', e);
        }
    }

    async function logout() {
        setAccessToken(null);
        setUserEmail(null);
        await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
        await AsyncStorage.removeItem(EMAIL_STORAGE_KEY);
    }

    return {
        accessToken,
        userEmail,
        isRestoring,
        isReady: !!request,
        login: () => promptAsync(),
        logout
    };
}
