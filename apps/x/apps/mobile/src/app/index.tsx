import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { useConnection } from '@/lib/connection';
import { ONBOARDED_KEY } from './onboarding';

// First launch walks through onboarding once; after that the app opens on
// the home tab once linked to an instance (Baarali, 07/10/2026), else on
// Spaces, where signing in happens.
export default function Home() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const { pairing } = useConnection();

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true)); // storage hiccup — never trap the user in onboarding
  }, []);

  if (onboarded === null || pairing === undefined) return null;
  if (onboarded && pairing) return <Redirect href="/home" />;
  return <Redirect href={onboarded ? '/spaces' : '/onboarding'} />;
}
