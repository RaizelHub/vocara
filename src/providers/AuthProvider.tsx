import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import type { Session, User } from "@supabase/supabase-js";

import { supabase, supabaseEnvironment } from "@/lib/supabase";
import { setSentryUser } from "@/lib/sentry";
import { authService, type SignUpInput, type SignUpResult } from "@/services/authService";
import {
  profileService,
  type UserProfileSnapshot,
} from "@/services/profileService";
import { resetInterviewSession } from "@/state/session";
import type { FocusArea, Profile, UserPreference } from "@/types/database";

type AuthContextValue = {
  deletionPending: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  focusAreas: FocusArea[];
  preferences: UserPreference | null;
  loading: boolean;
  bootstrapError: string | null;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [deletionPending, setDeletionPending] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [preferences, setPreferences] = useState<UserPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const mounted = useRef(true);
  const operation = useRef(0);
  const authEventGeneration = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  const explicitAuthEmail = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setSentryUser(user?.id);
  }, [user?.id]);

  const applySnapshot = useCallback((snapshot: UserProfileSnapshot) => {
    setDeletionPending(snapshot.deletionPending);
    setProfile(snapshot.profile);
    setFocusAreas(snapshot.focusAreas);
    setPreferences(snapshot.preferences);
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null, blockNavigation = true) => {
      const operationId = ++operation.current;
      if (!mounted.current) return;

      if (blockNavigation) setLoading(true);
      setBootstrapError(null);
      sessionRef.current = nextSession;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession) {
        setDeletionPending(false);
        setProfile(null);
        setFocusAreas([]);
        setPreferences(null);
        setLoading(false);
        return;
      }

      try {
        const verified = await supabase.auth.getUser(nextSession.access_token);
        if (verified.error || !verified.data.user) {
          const invalid = verified.error?.status === 401 || verified.error?.status === 403 || verified.error?.code === "user_not_found";
          if (!invalid) throw verified.error ?? new Error("Account verification unavailable");
          await supabase.auth.signOut({ scope: "local" }).catch(() => {});
          if (!mounted.current || operation.current !== operationId) return;
          sessionRef.current = null; setSession(null); setUser(null); setProfile(null);
          setDeletionPending(false); setFocusAreas([]); setPreferences(null); resetInterviewSession();
          return;
        }
        const snapshot = await profileService.getSnapshot(nextSession.user.id);
        if (!mounted.current || operation.current !== operationId) return;
        applySnapshot(snapshot);
      } catch (error) {
        if (__DEV__) console.error("[VOCARA profile bootstrap]");
        if (!mounted.current || operation.current !== operationId) return;
        setBootstrapError(getProfileLoadMessage(error));
      } finally {
        if (blockNavigation && mounted.current && operation.current === operationId) {
          setLoading(false);
        }
      }
    },
    [applySnapshot],
  );

  const retryBootstrap = useCallback(async () => {
    const eventGeneration = ++authEventGeneration.current;
    if (!supabaseEnvironment.configured) {
      setBootstrapError(supabaseEnvironment.error);
      setLoading(false);
      return;
    }

    setLoading(true);
    setBootstrapError(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (authEventGeneration.current !== eventGeneration) return;
      await applySession(data.session);
    } catch (error) {
      if (authEventGeneration.current !== eventGeneration) return;
      if (__DEV__) console.error("[VOCARA auth bootstrap]");
      if (mounted.current) {
        setBootstrapError(getProfileLoadMessage(error));
        setLoading(false);
      }
    }
  }, [applySession]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void retryBootstrap();
    }, 0);
    return () => clearTimeout(timer);
  }, [retryBootstrap]);

  useEffect(() => {
    if (!supabaseEnvironment.configured) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") return;
      const eventGeneration = ++authEventGeneration.current;

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        if (nextSession && sessionRef.current === null) {
          setTimeout(() => {
            if (authEventGeneration.current !== eventGeneration) return;
            void applySession(nextSession);
          }, 0);
          return;
        }
        sessionRef.current = nextSession;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        return;
      }

      if (event === "SIGNED_OUT") {
        resetInterviewSession();
        void applySession(null, false);
        return;
      }

      if (
        event === "SIGNED_IN" &&
        nextSession?.user.email?.toLowerCase() === explicitAuthEmail.current
      ) {
        return;
      }

      if (
        event === "SIGNED_IN" &&
        nextSession !== null &&
        nextSession.user.id === sessionRef.current?.user.id
      ) {
        sessionRef.current = nextSession;
        setSession(nextSession);
        setUser(nextSession.user);
        return;
      }

      setTimeout(() => {
        if (authEventGeneration.current !== eventGeneration) return;
        void applySession(nextSession);
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  useEffect(() => {
    if (!supabaseEnvironment.configured || Platform.OS === "web") return;

    if (AppState.currentState === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const signUp = useCallback(
    async (input: SignUpInput) => {
      explicitAuthEmail.current = input.email.trim().toLowerCase();
      try {
        const result = await authService.signUp(input);
        if (result.session) await applySession(result.session);
        return result;
      } finally {
        explicitAuthEmail.current = null;
      }
    },
    [applySession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      explicitAuthEmail.current = email.trim().toLowerCase();
      try {
        const result = await authService.signIn(email, password);
        await applySession(result.session);
      } finally {
        explicitAuthEmail.current = null;
      }
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    try {
      await authService.signOut();
      resetInterviewSession();
      await applySession(null, false);
    } catch (error) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        resetInterviewSession();
        await applySession(null, false);
      }
      throw error;
    }
  }, [applySession]);

  const resetPassword = useCallback(async (email: string) => {
    await authService.resetPassword(email);
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await authService.resendVerification(email);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    await authService.updatePassword(password);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) throw new Error("No authenticated session.");
    const requestedUserId = session.user.id;
    const snapshot = await profileService.getSnapshot(requestedUserId);
    if (mounted.current && sessionRef.current?.user.id === requestedUserId) {
      applySnapshot(snapshot);
    }
  }, [applySnapshot, session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        deletionPending,
        user,
        profile,
        focusAreas,
        preferences,
        loading,
        bootstrapError,
        signUp,
        signIn,
        signOut,
        resetPassword,
        updatePassword,
        resendVerification,
        refreshProfile,
        retryBootstrap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

function getProfileLoadMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("network") || message.includes("fetch")) {
    return "We couldn't connect. Check your internet connection and try again.";
  }
  return "We couldn't load your account. Please try again.";
}
