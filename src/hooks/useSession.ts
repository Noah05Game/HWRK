import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      authEventReceived = true;
      if (active) {
        setSession(session);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!active) return;
      if (error) console.error('Could not restore the authentication session:', error.message);
      if (!authEventReceived) setSession(sessionData.session);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Could not restore the authentication session:', error);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return { session, loading };
}
