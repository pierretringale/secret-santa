// [TIRAGE-FRONT] — Logique de la page du Noël des Darons
// Trigger    : ouverture de la page dans le navigateur
// Étapes     : résultat local ? l'afficher : liste des prénoms → choix → attente ≥ 3 s → résultat
// Contraintes: seulement liste_darons() et tirer() ; jamais de console.log d'une cible ou d'un jeton
// Cas limites: voir README.md section « Limites »

"use strict";

// La clé publishable est faite pour être publique : elle ne donne accès qu'à ces deux fonctions.
const SUPABASE_URL = "https://lpqoldonnylkufxiepgx.supabase.co";
const SUPABASE_CLE = "sb_publishable_C8Vik1-qNG_ibamz62b_RA_z9uTeWrj";

const ATTENTE_MIN_MS = 3000;
const CLE_JETON = "noel-darons.jeton";
const CLE_RESULTAT = "noel-darons.resultat";

const MESSAGES = {
  DEJA_TIRE: "Ce prénom a déjà tiré. Si ce n'était pas toi, préviens Pierre.",
  JETON_DEJA_UTILISE: "Ce téléphone a déjà tiré pour quelqu'un d'autre.",
  TIRAGE_PAS_PRET: "Le tirage n'est pas encore ouvert. Reviens un peu plus tard.",
  AUTRE: "Le sort ne répond pas. Vérifie ta connexion et réessaie.",
};
const MESSAGE_PRIVE = "Ouvre ce lien hors navigation privée, sinon tu ne pourras pas revoir ton résultat.";

const ICONE_COCHE =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B32D24" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';

const $ = (id) => document.getElementById(id);

let prenomChoisi = null;
let jetonEnMemoire = null; // secours si localStorage est indisponible
let tirageEnCours = false;

// ---------------------------------------------------------------------------
// Stockage local : chaque accès est protégé (navigation privée, stockage bloqué).
// ---------------------------------------------------------------------------

function lireStockage(cle) {
  try {
    return window.localStorage.getItem(cle);
  } catch (e) {
    return null;
  }
}

function ecrireStockage(cle, valeur) {
  try {
    window.localStorage.setItem(cle, valeur);
    return true;
  } catch (e) {
    return false;
  }
}

function stockageDisponible() {
  try {
    const test = "noel-darons.test";
    window.localStorage.setItem(test, "1");
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

function nouvelUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  // Anciens navigateurs : UUID v4 construit à partir de crypto.getRandomValues.
  const o = window.crypto.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = Array.from(o, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Le jeton identifie ce téléphone. Créé une fois, puis toujours le même.
function obtenirJeton() {
  const existant = lireStockage(CLE_JETON) ?? jetonEnMemoire;
  if (existant) return existant;
  const jeton = nouvelUuid();
  jetonEnMemoire = jeton;
  ecrireStockage(CLE_JETON, jeton);
  return jeton;
}

function lireResultat() {
  const brut = lireStockage(CLE_RESULTAT);
  if (!brut) return null;
  try {
    const r = JSON.parse(brut);
    return r && typeof r.prenom === "string" && typeof r.cible === "string" ? r : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Appel d'une fonction Supabase. En cas d'échec, l'erreur porte le code
// renvoyé par la base (ex. DEJA_TIRE) ou AUTRE.
// ---------------------------------------------------------------------------

async function appelerFonction(nom, corps) {
  let reponse;
  try {
    reponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
      method: "POST",
      headers: { apikey: SUPABASE_CLE, "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch (e) {
    throw new Error("AUTRE");
  }
  const donnees = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const code = donnees && typeof donnees.message === "string" ? donnees.message : "AUTRE";
    throw new Error(code in MESSAGES ? code : "AUTRE");
  }
  return donnees;
}

const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function afficherEcran(id) {
  for (const ecran of document.querySelectorAll(".ecran")) {
    ecran.hidden = ecran.id !== id;
  }
  window.scrollTo(0, 0);
  const titre = document.querySelector(`#${id} h1`);
  if (titre) titre.focus({ preventScroll: true });
}

function afficherMessage(texte) {
  const zone = $("message");
  zone.textContent = texte ?? "";
  zone.hidden = !texte;
}

function mettreAJourChoix() {
  for (const bouton of $("grille").querySelectorAll(".prenom")) {
    bouton.setAttribute("aria-pressed", String(bouton.dataset.prenom === prenomChoisi));
  }
  $("prenom-choisi").textContent = prenomChoisi ?? "";
  $("confirmation").classList.toggle("inactive", !prenomChoisi);
  $("confirmation").setAttribute("aria-hidden", String(!prenomChoisi));
  $("lancer").disabled = !prenomChoisi;
}

function construireGrille(darons) {
  const grille = $("grille");
  grille.textContent = "";
  for (const { prenom, deja_tire } of darons) {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "prenom";
    bouton.dataset.prenom = prenom;
    bouton.setAttribute("aria-pressed", "false");
    bouton.innerHTML = ICONE_COCHE;
    bouton.append(prenom);
    if (deja_tire) {
      bouton.disabled = true;
      bouton.setAttribute("aria-label", `${prenom}, déjà tiré`);
    }
    bouton.addEventListener("click", () => {
      prenomChoisi = prenom;
      afficherMessage(stockageDisponible() ? "" : MESSAGE_PRIVE);
      mettreAJourChoix();
    });
    grille.append(bouton);
  }
  if (prenomChoisi && !darons.some((d) => d.prenom === prenomChoisi && !d.deja_tire)) {
    prenomChoisi = null;
  }
  mettreAJourChoix();
}

async function chargerListe() {
  try {
    const darons = await appelerFonction("liste_darons", {});
    construireGrille(Array.isArray(darons) ? darons : []);
    return true;
  } catch (e) {
    afficherMessage(MESSAGES.AUTRE);
    return false;
  }
}

function afficherResultat(prenom, cible) {
  $("prenom-resultat").textContent = prenom;
  $("cible").textContent = cible;
  afficherEcran("resultat");
}

// ---------------------------------------------------------------------------
// Tirage
// ---------------------------------------------------------------------------

async function lancerTirage() {
  if (!prenomChoisi || tirageEnCours) return;
  tirageEnCours = true;
  const prenom = prenomChoisi;
  const jeton = obtenirJeton();

  $("prenom-attente").textContent = prenom;
  afficherEcran("attente");

  // L'attente dure au moins 3 secondes, même si la réponse arrive avant.
  const [issue] = await Promise.all([
    appelerFonction("tirer", { p_prenom: prenom, p_jeton: jeton }).then(
      (cible) => ({ cible }),
      (erreur) => ({ code: erreur.message })
    ),
    attendre(ATTENTE_MIN_MS),
  ]);
  tirageEnCours = false;

  if (typeof issue.cible === "string" && issue.cible) {
    ecrireStockage(CLE_RESULTAT, JSON.stringify({ prenom, cible: issue.cible }));
    afficherResultat(prenom, issue.cible);
    return;
  }

  afficherEcran("accueil");
  await chargerListe(); // grise les prénoms pris entre-temps
  afficherMessage(MESSAGES[issue.code] ?? MESSAGES.AUTRE);
}

// ---------------------------------------------------------------------------
// Ouverture
// ---------------------------------------------------------------------------

function enregistrerCopieHorsLigne() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function demarrer() {
  enregistrerCopieHorsLigne();

  // Déjà un résultat sur ce téléphone : on l'affiche, sans appel réseau.
  const resultat = lireResultat();
  if (resultat) {
    afficherResultat(resultat.prenom, resultat.cible);
    return;
  }

  afficherEcran("accueil");
  mettreAJourChoix();
  $("lancer").addEventListener("click", lancerTirage);

  const listeOk = await chargerListe();
  if (listeOk && !stockageDisponible()) {
    afficherMessage(MESSAGE_PRIVE);
  }
}

demarrer();
