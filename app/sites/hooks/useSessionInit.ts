"use client";

import { useEffect, useRef } from "react";
import { useSession } from "./useSession";
import { getSession, initSession } from "../session-actions";

interface SeedQrSession {
  sessionToken: string;
  floorPlanObjectId?: string | null;
  tableLabel?: string | null;
  tableQrCodeId?: string | null;
}

export function useSessionInit(
  storeConfigId: string | undefined,
  seedQrSession?: SeedQrSession | null
) {
  const initRef = useRef(false);

  useEffect(() => {
    if (!storeConfigId || initRef.current) return;
    initRef.current = true;

    const run = async () => {
      const state = useSession.getState();

      // If storeConfigId changed (different store), clear old session
      if (state.storeConfigId && state.storeConfigId !== storeConfigId) {
        useSession.getState().logout();
      }

      // Sync storeConfigId
      useSession.getState().setStoreConfigId(storeConfigId);

      if (seedQrSession?.sessionToken) {
        const currentToken = useSession.getState().sessionToken;
        if (currentToken !== seedQrSession.sessionToken) {
          useSession.getState().bindQrSession(seedQrSession.sessionToken, storeConfigId, {
            floorPlanObjectId: seedQrSession.floorPlanObjectId ?? null,
            tableLabel: seedQrSession.tableLabel ?? null,
            tableQrCodeId: seedQrSession.tableQrCodeId ?? null,
          });
        }
        return;
      }

      // If we already have a token, validate it
      const currentToken = useSession.getState().sessionToken;
      if (currentToken) {
        const result = await getSession(currentToken);
        if (result.data) return; // Valid session, done
        // Expired or invalid — clear and fall through
        useSession.getState().logout();
      }

      // Create a new anonymous session
      const result = await initSession(storeConfigId);
      if (result.data?.sessionToken) {
        useSession.getState().initSessionToken(result.data.sessionToken, storeConfigId);
      }
    };

    run();
  }, [storeConfigId, seedQrSession]);
}
