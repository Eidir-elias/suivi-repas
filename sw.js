// Service worker : permet à l'appli de fonctionner sans connexion.
// Stratégie : on essaie toujours internet d'abord (pour avoir la dernière version),
// et si ça échoue (ou si c'est trop lent), on utilise la copie gardée sur le téléphone.

const VERSION = "suivi-repas-v2";

const FICHIERS = [
    "./",
    "./index.html",
    "./script.js",
    "./style.css",
    "./manifest.json",
    "./icone-192.png",
    "./icone-512.png",
    "./icone-maskable-512.png"
];

self.addEventListener("install", function (evenement) {
    evenement.waitUntil(
        caches.open(VERSION).then((cache) => cache.addAll(FICHIERS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", function (evenement) {
    evenement.waitUntil(
        caches.keys().then(function (noms) {
            return Promise.all(
                noms.filter((nom) => nom !== VERSION).map((nom) => caches.delete(nom))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", function (evenement) {
    const requete = evenement.request;
    const adresse = new URL(requete.url);

    // On ne touche pas aux autres sites (ex : Open Food Facts)
    if (requete.method !== "GET" || adresse.origin !== self.location.origin) {
        return;
    }

    evenement.respondWith(reseauPuisCache(requete));
});

async function reseauPuisCache(requete) {
    const cache = await caches.open(VERSION);
    const annulation = new AbortController();
    const delai = setTimeout(() => annulation.abort(), 4000);

    try {
        // "no-cache" = on vérifie toujours auprès de GitHub s'il y a une nouvelle version
        const reponse = await fetch(requete.url, { cache: "no-cache", signal: annulation.signal });
        if (reponse.ok) {
            cache.put(requete, reponse.clone());
        }
        return reponse;
    } catch (e) {
        const copie = await cache.match(requete, { ignoreSearch: true });
        if (copie) {
            return copie;
        }
        if (requete.mode === "navigate") {
            return cache.match("./index.html");
        }
        throw e;
    } finally {
        clearTimeout(delai);
    }
}
