<script lang="ts">
import { defineComponent } from "vue";
import { event } from "vue-gtag";
import { ContactCompare, EventType, SyncProgress } from "../../../interfaces/api";
import { addHandler, WS } from "../services/ws";

export default defineComponent({
  data: () => ({
    imageDisplayedCount: 9,
    syncProgress: 0,
    syncCount: 0,
    skippedCount: 0,
    contact: undefined as ContactCompare | undefined | null,
    images: [] as string[],
    totalContactsPushed: false,
    errorMessage: undefined as string | undefined,
    lastSyncReceived: null as number | null,
  }),

  mounted() {
    addHandler(EventType.ContactCompare, this.onContactCompare);
    addHandler(EventType.SyncProgress, this.onSyncProgress);
    this.initSync();
    setInterval(this.checkServerDisconnected, 5 * 1000);
  },

  methods: {
    initSync() {
      fetch(`/api/init_sync${window.location.search}`, {
        credentials: "include",
      });
    },

    checkServerDisconnected() {
      // Display an error message if the server has disconnected.
      this.errorMessage =
        this.lastSyncReceived && Date.now() - this.lastSyncReceived > 30 * 1000
          ? "Server has disconnected. Please refresh the page and restart the process."
          : undefined;
    },

    onContactCompare(contact: ContactCompare) {
      console.log("Contact compare", contact);
      this.contact = contact;
    },

    onContactApply() {
      WS.send(JSON.stringify({
        type: EventType.ContactPhotoApply,
        payload: this.contact,
      }))

      this.contact = null;
    },

    onContactSkip() {
      WS.send(JSON.stringify({
        type: EventType.ContactPhotoSkip,
        payload: this.contact,
      }))

      this.contact = null;
    },

    onSyncProgress(progress: SyncProgress): void {
      if (!this.totalContactsPushed) {
        event("num_contacts_synced", {
          method: "Google",
          value: progress.totalContacts,
        });
        this.totalContactsPushed = true;
      }

      this.lastSyncReceived = Date.now();
      this.syncProgress = progress.progress;
      this.syncCount = progress.syncCount;
      this.skippedCount = progress.skippedCount;
      this.errorMessage = progress.error;

      if (this.syncProgress === 100) {
        this.contact = undefined;
      }

      if (progress.image && progress.isSynced) {
        this.images.push(progress.image);
        if (this.images.length > this.imageDisplayedCount) this.images.shift();
      }
    },
  },
});
</script>

<template>
  <div id="home" class="hero h-full bg-base-200">
    <div class="hero-content text-center">
      <div class="max-w-md">
        <h1 class="text-5xl font-bold">Sync In Progress</h1>
        <p class="py-6">
          Your contacts are syncing, you can sit back and relax.
          <br /><br />
          (Syncing will stop if the tab is closed)
        </p>

        <div
          role="alert"
          v-if="errorMessage"
          class="inline-flex mb-2 alert alert-error max-w-64"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{{ errorMessage }}</span>
        </div>

        <div :hidden="contact === undefined">
          <div class="card bg-base-100 shadow-xl mb-8">
            <div class="mb-4">
              <div v-if="contact?.name == null" class="skeleton w-full h-8 rounded-full"></div>
              <h1 v-else class="text-3xl font-bold">{{ contact?.name }}</h1>
            </div>
            <div class="flex flex-row gap-4 h-44">
              <figure class="flex-1">
                <div v-if="contact?.whatsapp == null" class="skeleton size-full rounded-2xl"></div>
                <img
                    v-else
                    width="100%"
                    height="100%"
                    :src="'data:image/jpeg;base64, ' + contact?.whatsapp"
                    alt="Google Contact"
                    class="rounded-2xl"
                />
              </figure>
              ->
              <figure class="flex-1">
                <div v-if="contact?.google == null" class="skeleton size-full rounded-2xl"></div>
                <img
                    v-else
                    width="100%"
                    height="100%"
                    :src="'data:image/jpeg;base64, ' + contact?.google"
                    alt="WhatsApp Contact"
                    class="rounded-2xl"
                />
              </figure>
            </div>
            <div class="card-body">
              <h2 class="card-title">Compare Contact Photos</h2>
              <p>Please compare the photos of the contact and decide if you want to update it.</p>
            </div>

            <div class="card-actions justify-end">
              <button @click="onContactSkip" class="btn btn-error">Skip</button>
              <button @click="onContactApply" class="btn btn-primary">Apply</button>
            </div>
          </div>
        </div>

        <div>
          <progress
            class="progress progress-primary w-5/6"
            :value="syncProgress"
            max="100"
            :hidden="syncProgress === 100"
          ></progress>
        </div>
        <div :hidden="syncProgress !== 100">
          <div class="badge badge-primary w-5/6">Sync complete!</div>
        </div>

        <div class="avatar-group -space-x-6 inline-flex pt-4">
          <div
            class="avatar"
            v-for="(image, index) in images.slice(-imageDisplayedCount)"
            :key="index"
          >
            <div class="w-12">
              <img :src="'data:image/jpeg;base64, ' + image" />
            </div>
          </div>
          <div :hidden="syncCount <= imageDisplayedCount">
            <div class="avatar placeholder">
              <div class="w-12 bg-neutral text-neutral-content">
                <span
                  >+{{
                    syncCount > imageDisplayedCount
                      ? syncCount - imageDisplayedCount
                      : 0
                  }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
