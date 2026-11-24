// [TIRAGE-SW] — Garde une copie de la page sur le téléphone pour la rouvrir sans réseau
// Trigger    : enregistré par app.js à la première visite
// Étapes     : installation → copie des fichiers du site ; ensuite réseau d'abord, copie en secours
// Contraintes: ne touche qu'aux fichiers du site (jamais aux appels Supabase, d'une autre origine)
// Cas limites: voir README.md section « Limites »

const CACHE = "noel-darons-v1";
const FICHIERS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "assets/vignette.jpg",
  "assets/fonts/lobster-400.woff2",
  "assets/fonts/bebas-neue-400.woff2",
  "assets/fonts/barlow-400.woff2",
  "assets/fonts/barlow-500.woff2",
  "assets/fonts/barlow-600.woff2",
  "assets/fonts/barlow-700.woff2",
];

// === ÉTAPE 1 : INSTALLATION, COPIE DES FICHIERS ===
self.addEventListener("install", (evenement) => {
  evenement.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FICHIERS)));
  self.skipWaiting();
});

// === ÉTAPE 2 : ACTIVATION, SUPPRESSION DES ANCIENNES COPIES ===
self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((cle) => cle !== CACHE).map((cle) => caches.delete(cle))))
      .then(() => self.clients.claim())
  );
});

// === ÉTAPE 3 : RÉSEAU D'ABORD, COPIE SI LE RÉSEAU NE RÉPOND PAS ===
self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET" || new URL(requete.url).origin !== self.location.origin) return;

  evenement.respondWith(
    fetch(requete)
      .then((reponseReseau) => {
        if (reponseReseau.ok) {
          const copie = reponseReseau.clone();
          caches.open(CACHE).then((cache) => cache.put(requete, copie));
        }
        return reponseReseau;
      })
      .catch(() => caches.match(requete, { ignoreSearch: true }))
  );
});
