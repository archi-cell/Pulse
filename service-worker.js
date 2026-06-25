const CACHE_NAME = "pulse-v2";
const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./icon.png",
    "./icon.png"
];

// Install: cache app shell
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

// Activate: remove old caches (pulse-v1 etc.)
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for everything else
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Only handle same-origin GET requests
    if (event.request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    const isAppShell = APP_SHELL.some((path) =>
        url.pathname.endsWith(path.replace("./", "/")) || url.pathname === "/"
    );

    if (isAppShell) {
        // Cache-first: serve from cache, fall back to network and re-cache
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
    } else {
        // Network-first for other assets: try network, fall back to cache
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});

// Handle periodic background sync for reminder badge (if supported)
self.addEventListener("periodicsync", (event) => {
    if (event.tag === "pulse-reminder") {
        event.waitUntil(showReminderNotification());
    }
});

async function showReminderNotification() {
    const clients = await self.clients.matchAll({ type: "window" });
    // Only notify if no Pulse window is currently open and focused
    const hasFocusedClient = clients.some((c) => c.focused);
    if (hasFocusedClient) return;

    return self.registration.showNotification("Pulse reminder", {
        body: "How are you feeling? Take your evening pulse check-in.",
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: "pulse-reminder",
        renotify: false,
        data: { url: "./" }
    });
}

// Notification click: focus or open the app
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window" }).then((clients) => {
            const existing = clients.find((c) => c.url.includes(self.location.origin));
            if (existing) return existing.focus();
            return self.clients.openWindow(event.notification.data?.url || "./");
        })
    );
});