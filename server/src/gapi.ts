import dotenv from "dotenv";
import { Auth, google, people_v1 } from "googleapis";
import { WebSocket } from "ws";
import { EventType } from "../../interfaces/api";
import { SimpleContact } from "./interfaces";
import { Base64, GoogleContact } from "./types";
import { sendEvent } from "./ws";

dotenv.config();

const pageSize: number = 250;

export function googleLogin(
  token: typeof google.Auth.AccessTokenResponse
): Auth.OAuth2Client {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(token);

  return oauth2Client;
}

export async function listContacts(
  auth: Auth.OAuth2Client
): Promise<SimpleContact[]> {
  const people: people_v1.People = google.people({ version: "v1", auth });

  let simpleContacts: SimpleContact[] = [];
  let nextPageToken = "";

  do {
    const res = await people.people.connections.list({
      resourceName: "people/me",
      pageSize: pageSize,
      personFields: "names,emailAddresses,phoneNumbers,photos",
      pageToken: nextPageToken,
    });

    nextPageToken = res.data.nextPageToken!;
    const connections = res.data.connections;

    const contacts = connections!
      .filter((connection) => connection.phoneNumbers)
      .map(
        (connection) =>
          <SimpleContact>{
            id: connection.resourceName,
            numbers: connection
              .phoneNumbers!.filter((phoneNumber) => phoneNumber.canonicalForm)
              .map((phoneNumber) =>
                phoneNumber.canonicalForm!.replace("+", "")
              ),
            hasPhoto: !connection.photos // Check if photos contain only the "default" photo
              ?.map((photo) => photo.default)
              .every((v) => v === true),
          }
      );

    simpleContacts = simpleContacts.concat(contacts);
  } while (nextPageToken);

  return simpleContacts;
}

export async function updateContactPhoto(
  auth: Auth.OAuth2Client,
  resourceName: string,
  photo: Base64,
  ws?: WebSocket,
): Promise<boolean> {
  const people: people_v1.People = google.people({ version: "v1", auth });

  if (ws) {
    let approved: boolean | undefined = undefined;

    const googleContact = await getCurrentContact(auth, resourceName);
    sendEvent(ws, EventType.ContactCompare, {
      name: googleContact.name,
      google: googleContact.photo,
      whatsapp: photo
    })

    ws.onmessage = (message) => {
      const event: Event = JSON.parse(message.data.toString());

      if (event.type === EventType.ContactPhotoApply) {
        console.debug("User approved contact photo update");
        approved = true;
      } else if (event.type === EventType.ContactPhotoSkip) {
        console.debug("User denied contact photo update");
        approved = false;
      }
    }

    /**
     * If the user doesn't respond in 60 seconds, deny by default.
     * This is to ensure the sync doesn't get stuck forever and uses resources without a limit.
     */
    const timeout = setTimeout(() => {
      if (approved === undefined) {
        console.warn("User took too long to approve contact photo update, denying by default");
        approved = false;
      }
    }, 60 * 1000)

    while (approved === undefined) {
      // Wait for user response, 200ms is an arbitrary value and can be changed if needed.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    clearTimeout(timeout);

    if (approved === false) {
      console.debug("User denied contact photo update, skipping");
      return false;
    }
  }

  try {
    await people.people.updateContactPhoto({
      resourceName: resourceName,
      requestBody: { photoBytes: photo },
    });
  } catch (e) {
    console.error(e);
    return false;
  }

  return true;
}

export async function getCurrentContact(
  auth: Auth.OAuth2Client,
  resourceName: string
): Promise<GoogleContact> {
  const people: people_v1.People = google.people({ version: "v1", auth });

  const res = await people.people.get({
    resourceName: resourceName,
    personFields: "names,photos",
  });

  const photo = res.data.photos![0].url!;
  const base64 = await fetch(photo).then((res) => res.arrayBuffer()).then((buf) => (Buffer.from(buf)).toString("base64"));

  return {
    name: res.data.names![0].displayName!,
    photo: base64
  };
}
