import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import type { MessagePayload } from 'firebase/messaging';

// The deploy pipeline may inject placeholder values ("-") when the Firebase
// config is missing. Treat them as "not configured" instead of trying to
// initialize an app that can never obtain a token.
const configValue = (value?: string) => (value && value !== '-' ? value : undefined);

const firebaseConfig = {
  apiKey: configValue(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: configValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: configValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: configValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: configValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: configValue(import.meta.env.VITE_FIREBASE_APP_ID),
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    firebaseConfig.messagingSenderId,
);

if (!isFirebaseConfigured) {
  console.warn('Firebase not configured — push notifications disabled.');
}

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

const messaging = (() => {
  if (!app) return null;
  try {
    // getMessaging throws in unsupported browsers (old Safari, some private modes).
    return getMessaging(app);
  } catch (error) {
    console.warn('Firebase Messaging is not supported in this browser.', error);
    return null;
  }
})();

export const requestForToken = async () => {
  if (!messaging) return null;
  try {
    const currentToken = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });
    if (currentToken) {
      console.log('Current token for client: ', currentToken);
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.log('An error occurred while retrieving token. ', err);
    return null;
  }
};

export const onForegroundMessage = (callback: (payload: MessagePayload) => void) => {
  if (!messaging) return () => {};
  try {
    return onMessage(messaging, (payload) => {
      console.log('Foreground message received: ', payload);
      callback(payload);
    });
  } catch (error) {
    console.warn('Failed to subscribe to foreground messages.', error);
    return () => {};
  }
};
