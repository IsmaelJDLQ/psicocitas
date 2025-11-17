import { useEffect, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {

      if (!navigator.onLine) {
        if (!cancelled) setOnline(false);
        return;
      }

      if (!SUPABASE_URL) {
        if (!cancelled) setOnline(navigator.onLine);
        return;
      }

      try {
        const base = SUPABASE_URL.replace(/\/+$/, "");
        const res = await fetch(`${base}/auth/v1/health`, {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });

        if (!cancelled) {
          setOnline(true);
        }
      } catch (err) {
        if (!cancelled) setOnline(false);
      }
    };

    checkConnection();

    const intervalId = setInterval(checkConnection, 5000);

    window.addEventListener("online", checkConnection);
    window.addEventListener("offline", checkConnection);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("online", checkConnection);
      window.removeEventListener("offline", checkConnection);
    };
  }, []);

  return online;
}
