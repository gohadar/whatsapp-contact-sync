import { WebSocket } from "ws";
import { Auth } from "googleapis";
import { RateLimiter } from "limiter";
import { Client } from "whatsapp-web.js";

import { EventType, SyncOptions } from "../../interfaces/api";
import { listContacts, updateContactPhoto } from "./gapi";
import { downloadFile, loadContacts } from "./whatsapp";
import { sendEvent } from "./ws";
import { SimpleContact } from "./interfaces";
import { getFromCache } from "./cache";

export async function initSync(id: string, syncOptions: SyncOptions) {
  // The limiter is implemented due to Google API's limit of 60 photo uploads per minute per user
  const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 1500 });

  const ws: WebSocket = getFromCache(id, "ws");
  const whatsappClient: Client = getFromCache(id, "whatsapp");
  const gAuth: Auth.OAuth2Client = getFromCache(id, "gauth");

  let googleContacts: SimpleContact[];
  let whatsappContacts: Map<string, string>;

  try {
    googleContacts = await listContacts(gAuth);
    whatsappContacts = await loadContacts(whatsappClient);
  } catch (e) {
    console.error(e);
    if (ws.readyState === WebSocket.OPEN) {
      sendEvent(ws, EventType.SyncProgress, {
        progress: 0,
        syncCount: 0,
        error: "Failed to load contacts, please try again.",
      });
    }
    return;
  }

  let syncCount: number = 0;
  let skippedCount: number = 0;
  let isSynced: boolean | null = null;
  let photo: string | null = null;

  // For some reason all of the contacts that don't have a photo are at the beginning of the array.
  // This causes the sync to feel slow since no photos show up on the UI.
  // To "fix" this, we shuffle the array so that the contacts without photos are spread out.
  const shuffledGoogleContacts = googleContacts.sort(() => Math.random() - 0.5);

  for (const [index, googleContact] of shuffledGoogleContacts.entries()) {
    if (ws.readyState !== WebSocket.OPEN) return; // Stop sync if user disconnected.

    if (syncOptions.overwrite_photos === "false" && googleContact.hasPhoto)
      continue;

    for (const phoneNumber of googleContact.numbers) {
      let whatsappContactId: string | undefined;

      // Fix for Brazilian numbers with extra '9'
      if (
        !whatsappContacts.has(phoneNumber) &&
        phoneNumber.slice(0, 2) === "55"
      ) {
        if (phoneNumber.length === 12) {
          whatsappContactId = whatsappContacts.get(
            phoneNumber.slice(0, 4) + "9" + phoneNumber.slice(4)
          );
        } else {
          whatsappContactId = whatsappContacts.get(
            phoneNumber.slice(0, 4) + phoneNumber.slice(5)
          );
        }
      } else {
        whatsappContactId = whatsappContacts.get(phoneNumber);
      }
      if (!whatsappContactId) continue;

      photo = await downloadFile(whatsappClient, whatsappContactId);
      if (photo === null) break;

      /**
       * The current implementation for the confirmation is slow because it waits for the user to
       * approve or skip before continuing to the next contact. This causes more delays because it
       * takes a bit of time to get the next contact's photo, which results in a bit of "downtime".
       *
       * A better way to handle this is to pre-fetch the next contact's photo while waiting for the
       * user's response. This way, once the user approves the current contact the sync can continue
       * without any delays. Another way is to store the URLs of the photos in the `googleContacts`
       * array and use them when needed. This way, we can avoid fetching the same photo multiple
       * times.
       *
       * TODO: Implement pre-fetching of the next contact's photo.
       */
      isSynced = await updateContactPhoto(gAuth, googleContact.id, photo, ws);

      if (isSynced) {
        await limiter.removeTokens(1);
        syncCount++;
      } else {
        skippedCount++;
      }

      break;
    }

    sendEvent(ws, EventType.SyncProgress, {
      progress: (index / googleContacts.length) * 100,
      syncCount: syncCount,
      skippedCount,
      totalContacts: googleContacts.length,
      image: photo,
      isSynced
    });

    photo = null;
  }

  sendEvent(ws, EventType.SyncProgress, {
    progress: 100,
    syncCount: syncCount,
  });

  ws.close();
}
