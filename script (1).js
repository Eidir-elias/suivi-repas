// =====================================================================
// 1. Récupération des éléments HTML
// =====================================================================
const bouton = document.getElementById("btn-ajouter-article");
const selectRepas = document.getElementById("select-repas");
const btnAjouterRepas = document.getElementById("btn-ajouter-repas");
const popupInfo = document.getElementById("popup-info");

const inputAliment = document.getElementById("aliment");
const inputGrammes = document.getElementById("grammes");
const inputCalories = document.getElementById("calories");
const inputProteines = document.getElementById("proteines");
const inputPrixKg = document.getElementById("prix-kg");
const tousLesInputs = [inputAliment, inputGrammes, inputCalories, inputProteines, inputPrixKg];

const messageProduit = document.getElementById("message-produit");
const fenetreScanner = document.getElementById("fenetre-scanner");
const videoScanner = document.getElementById("video-scanner");
const texteScanner = document.getElementById("texte-scanner");
const inputCodeManuel = document.getElementById("code-manuel");

const inputPhoto = document.getElementById("input-photo");
const fenetrePhoto = document.getElementById("fenetre-photo");
const photoGrande = document.getElementById("photo-grande");

const infoStockage = document.getElementById("info-stockage");
const inputImport = document.getElementById("input-import");

for (const input of tousLesInputs) {
    input.dataset.original = input.placeholder;
}

// Petit ✕ dans le champ "Aliment" : visible seulement s'il y a du texte
const btnEffacerAliment = document.getElementById("btn-effacer-aliment");

function mettreAJourBoutonEffacer() {
    btnEffacerAliment.classList.toggle("cache", inputAliment.value === "");
}

inputAliment.addEventListener("input", mettreAJourBoutonEffacer);

btnEffacerAliment.addEventListener("click", function () {
    inputAliment.value = "";
    mettreAJourBoutonEffacer();
    inputAliment.focus();
});

// =====================================================================
// 2. Données en mémoire
// =====================================================================
const repas = [];               // les repas du jour affiché
let dateCourante = new Date();  // le jour affiché
let jourReel = formaterDate(new Date()); // le vrai jour d'aujourd'hui
let repasPourPhoto = null;      // index du repas qui va recevoir une photo
const urlsPhotos = new Map();   // photoId -> adresse temporaire de l'image

// =====================================================================
// 3. Base de données IndexedDB (stockée dans la mémoire du téléphone)
//    - "jours"  : { date: "2026-11-25", repas: [...] }
//    - "photos" : { id: 1, blob: <image> }
// =====================================================================
let bdd = null;

function ouvrirBDD() {
    return new Promise(function (resoudre, rejeter) {
        const demande = indexedDB.open("suivi-repas", 1);
        demande.onupgradeneeded = function () {
            const base = demande.result;
            base.createObjectStore("jours", { keyPath: "date" });
            base.createObjectStore("photos", { keyPath: "id", autoIncrement: true });
        };
        demande.onsuccess = () => resoudre(demande.result);
        demande.onerror = () => rejeter(demande.error);
    });
}

// Lance une opération sur une table et attend qu'elle soit vraiment écrite
function operation(table, mode, action) {
    return new Promise(function (resoudre, rejeter) {
        const transaction = bdd.transaction(table, mode);
        const requete = action(transaction.objectStore(table));
        transaction.oncomplete = () => resoudre(requete ? requete.result : undefined);
        transaction.onerror = () => rejeter(transaction.error);
        transaction.onabort = () => rejeter(transaction.error);
    });
}

const lireJour = (date) => operation("jours", "readonly", (t) => t.get(date));
const ecrireJour = (date, listeRepas) => operation("jours", "readwrite", (t) => t.put({ date: date, repas: listeRepas }));
const ajouterPhotoBDD = (blob) => operation("photos", "readwrite", (t) => t.add({ blob: blob }));
const lirePhotoBDD = (id) => operation("photos", "readonly", (t) => t.get(id));
const supprimerPhotoBDD = (id) => operation("photos", "readwrite", (t) => t.delete(id));
const lireTousLesJours = () => operation("jours", "readonly", (t) => t.getAll());
const lireToutesLesPhotos = () => operation("photos", "readonly", (t) => t.getAll());

// Les anciennes données (localStorage, clés "jour-...") sont copiées une seule fois
async function migrerAnciennesDonnees() {
    if (localStorage.getItem("suivi-repas-migration-faite")) {
        return;
    }
    for (let k = 0; k < localStorage.length; k++) {
        const cle = localStorage.key(k);
        if (!cle.startsWith("jour-")) {
            continue;
        }
        const date = cle.slice(5);
        const deja = await lireJour(date);
        if (deja) {
            continue;
        }
        let donnees = null;
        try {
            donnees = JSON.parse(localStorage.getItem(cle));
        } catch (e) {
            continue;
        }
        if (!Array.isArray(donnees) || donnees.length === 0) {
            continue;
        }
        // Ancien format : une simple liste d'articles -> on la met dans "repas 1"
        const listeRepas = donnees[0].articles !== undefined
            ? donnees
            : [{ nom: "repas 1", articles: donnees }];
        await ecrireJour(date, listeRepas);
    }
    // On garde les anciennes données par sécurité, on note juste que c'est fait
    localStorage.setItem("suivi-repas-migration-faite", "oui");
}

// Demande à Chrome de ne jamais effacer les données tout seul
async function protegerStockage() {
    if (navigator.storage && navigator.storage.persist) {
        try {
            await navigator.storage.persist();
        } catch (e) {
            // pas grave, on affichera juste "non protégé"
        }
    }
    await afficherInfoStockage();
}

async function afficherInfoStockage() {
    if (!navigator.storage || !navigator.storage.estimate) {
        infoStockage.textContent = "Infos de stockage indisponibles sur ce navigateur.";
        return;
    }
    const estimation = await navigator.storage.estimate();
    const protege = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const utiliseMo = (estimation.usage / 1024 / 1024).toFixed(1);
    const dispoGo = (estimation.quota / 1024 / 1024 / 1024).toFixed(1);
    infoStockage.textContent = `${utiliseMo} Mo utilisés sur ${dispoGo} Go disponibles · `
        + (protege ? "protégé contre l'effacement automatique ✓" : "non protégé (installe l'appli)");
}

async function sauvegarder() {
    try {
        await ecrireJour(formaterDate(dateCourante), repas);
    } catch (e) {
        alert("Erreur d'enregistrement : " + e.message);
    }
}

// =====================================================================
// 4. Fonctions utilitaires (erreurs, popup, dates)
// =====================================================================
function marquerErreur(input, message) {
    input.value = "";
    if (input === inputAliment) {
        btnEffacerAliment.classList.add("cache");
    }
    input.placeholder = message;
    input.classList.add("erreur");
}

function effacerErreurs() {
    for (const input of tousLesInputs) {
        input.classList.remove("erreur");
        input.placeholder = input.dataset.original;
    }
}

function afficherPopup(evenement, texte, estRepas = false) {
    evenement.stopPropagation();
    const rect = evenement.currentTarget.getBoundingClientRect();

    popupInfo.textContent = texte;
    popupInfo.classList.toggle("popup-repas", estRepas);
    popupInfo.classList.remove("popup-cache");

    let leftPos;
    let topPos;

    if (estRepas) {
        leftPos = rect.left + (rect.width - popupInfo.offsetWidth) / 2;
        topPos = rect.bottom + 8;
        if (topPos + popupInfo.offsetHeight > window.innerHeight - 8) {
            topPos = rect.top - popupInfo.offsetHeight - 8;
        }
    } else {
        leftPos = rect.left;
        topPos = rect.top - popupInfo.offsetHeight - 8;
        if (topPos < 8) {
            topPos = rect.bottom + 8;
        }
    }

    if (leftPos + popupInfo.offsetWidth > window.innerWidth - 8) {
        leftPos = window.innerWidth - popupInfo.offsetWidth - 8;
    }

    popupInfo.style.left = Math.max(8, leftPos) + "px";
    popupInfo.style.top = Math.max(8, topPos) + "px";
}

document.addEventListener("click", function () {
    popupInfo.classList.add("popup-cache");
});

function formaterDate(date) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");
    return `${annee}-${mois}-${jour}`;
}

function afficherMessageProduit(texte, type) {
    messageProduit.textContent = texte;
    messageProduit.className = "message-produit " + type;
}

// =====================================================================
// 5. Affichage
// =====================================================================
function mettreAJourSelectRepas() {
    const selectionActuelle = selectRepas.value;
    selectRepas.innerHTML = "";

    for (let m = 0; m < repas.length; m++) {
        const option = document.createElement("option");
        option.value = m;
        option.textContent = repas[m].nom;
        selectRepas.appendChild(option);
    }

    if (selectionActuelle !== "" && repas[selectionActuelle]) {
        selectRepas.value = selectionActuelle;
    }
}

// Met l'image dans la balise <img> (chargée depuis la base si besoin)
async function chargerImage(img, photoId) {
    if (!urlsPhotos.has(photoId)) {
        const photo = await lirePhotoBDD(photoId);
        if (!photo) {
            return;
        }
        urlsPhotos.set(photoId, URL.createObjectURL(photo.blob));
    }
    img.src = urlsPhotos.get(photoId);
}

function afficher() {
    const listeArticles = document.getElementById("liste-articles");
    listeArticles.innerHTML = "";

    let totalKcal = 0;
    let totalProt = 0;
    let totalPrix = 0;

    for (let m = 0; m < repas.length; m++) {
        let repasKcal = 0;
        let repasProt = 0;
        let repasPrix = 0;

        // Bandeau du repas
        const trBandeau = document.createElement("tr");
        const tdBandeau = document.createElement("td");
        tdBandeau.colSpan = 6;
        tdBandeau.className = "bandeau-repas";
        tdBandeau.textContent = repas[m].nom;

        tdBandeau.addEventListener("click", function (e) {
            const resume = `${repas[m].nom.toUpperCase()} : ${repasKcal.toFixed(2)} kcal | ${repasProt.toFixed(2)} g prot | ${repasPrix.toFixed(2)} €`;
            afficherPopup(e, resume, true);
        });

        // Bouton photo (à gauche du bandeau) : 📷 = prendre une photo, 🖼️ = voir la photo
        const btnPhoto = document.createElement("button");
        btnPhoto.type = "button";
        btnPhoto.className = "btn-photo-repas";
        const aUnePhoto = Boolean(repas[m].photoId);
        btnPhoto.textContent = aUnePhoto ? "🖼️" : "📷";
        btnPhoto.title = aUnePhoto ? "Voir la photo" : "Prendre une photo";
        btnPhoto.addEventListener("click", function (e) {
            e.stopPropagation();
            if (repas[m].photoId) {
                ouvrirPhoto(m);
            } else {
                repasPourPhoto = m;
                inputPhoto.value = "";
                inputPhoto.click();
            }
        });
        tdBandeau.appendChild(btnPhoto);

        if (repas.length > 1) {
            const btnSupprRepas = document.createElement("button");
            btnSupprRepas.textContent = "✕";
            btnSupprRepas.type = "button";
            btnSupprRepas.className = "btn-suppr-repas";
            btnSupprRepas.title = "Supprimer ce repas";

            btnSupprRepas.addEventListener("click", async function (e) {
                e.stopPropagation();
                if (!confirm(`Es-tu sûr de vouloir supprimer ${repas[m].nom} ?`)) {
                    return;
                }
                popupInfo.classList.add("popup-cache");
                const photoId = repas[m].photoId;
                repas.splice(m, 1);
                for (let k = 0; k < repas.length; k++) {
                    repas[k].nom = "repas " + (k + 1);
                }
                await sauvegarder();
                if (photoId) {
                    await supprimerPhotoBDD(photoId);
                }
                mettreAJourSelectRepas();
                selectRepas.value = Math.min(m, repas.length - 1);
                afficher();
            });

            tdBandeau.appendChild(btnSupprRepas);
        }

        trBandeau.appendChild(tdBandeau);
        listeArticles.appendChild(trBandeau);

        // Articles du repas
        const articlesDuRepas = repas[m].articles;
        for (let i = 0; i < articlesDuRepas.length; i++) {
            const article = articlesDuRepas[i];
            const kcalCalculees = (article.grammes * article.kcal100) / 100;
            const protCalculees = (article.grammes * article.prot100) / 100;
            const prixCalcule = (article.grammes * article.prixKg) / 1000;

            repasKcal += kcalCalculees;
            repasProt += protCalculees;
            repasPrix += prixCalcule;

            totalKcal += kcalCalculees;
            totalProt += protCalculees;
            totalPrix += prixCalcule;

            const tr = document.createElement("tr");

            const tdNom = document.createElement("td");
            tdNom.textContent = article.nom;

            const tdGrammes = document.createElement("td");
            tdGrammes.textContent = article.grammes;

            const tdKcalCalc = document.createElement("td");
            tdKcalCalc.textContent = kcalCalculees.toFixed(2);
            tdKcalCalc.classList.add("cellule-cliquable");
            tdKcalCalc.addEventListener("click", function (e) {
                afficherPopup(e, article.kcal100 + " kcal / 100 g");
            });

            const tdProtCalc = document.createElement("td");
            tdProtCalc.textContent = protCalculees.toFixed(2);
            tdProtCalc.classList.add("cellule-cliquable");
            tdProtCalc.addEventListener("click", function (e) {
                afficherPopup(e, article.prot100 + " g prot / 100 g");
            });

            const tdPrixCalc = document.createElement("td");
            tdPrixCalc.textContent = prixCalcule.toFixed(2) + " €";
            tdPrixCalc.classList.add("cellule-cliquable", "cellule-prix");
            tdPrixCalc.addEventListener("click", function (e) {
                afficherPopup(e, article.prixKg.toFixed(2) + " €/kg");
            });

            const tdSuppr = document.createElement("td");
            const btnSuppr = document.createElement("button");
            btnSuppr.textContent = "✕";
            btnSuppr.type = "button";
            btnSuppr.addEventListener("click", async function () {
                repas[m].articles.splice(i, 1);
                await sauvegarder();
                afficher();
            });
            tdSuppr.appendChild(btnSuppr);

            tr.append(tdNom, tdGrammes, tdKcalCalc, tdProtCalc, tdPrixCalc, tdSuppr);
            listeArticles.appendChild(tr);
        }
    }

    document.getElementById("total-kcal").textContent = totalKcal.toFixed(2);
    document.getElementById("total-prot").textContent = totalProt.toFixed(2);
    document.getElementById("total-prix").textContent = totalPrix.toFixed(2) + " €";

    // Le même total, affiché en haut sous la date
    document.getElementById("haut-kcal").textContent = Math.round(totalKcal);
    document.getElementById("haut-prot").textContent = totalProt.toFixed(1);
    document.getElementById("haut-prix").textContent = totalPrix.toFixed(2);
}

// =====================================================================
// 6. Ajout d'un article
// =====================================================================
bouton.addEventListener("click", async function () {
    const nomAliment = inputAliment.value;
    const grammes = parseFloat(inputGrammes.value) || 0;
    const kcal100 = parseFloat(inputCalories.value) || 0;
    const prot100 = parseFloat(inputProteines.value) || 0;
    const prixKg = parseFloat(inputPrixKg.value) || 0;

    effacerErreurs();
    let aUneErreur = false;

    if (nomAliment.trim() === "") {
        marquerErreur(inputAliment, "Donne un nom !");
        aUneErreur = true;
    }
    if (grammes <= 0) {
        marquerErreur(inputGrammes, "Mettre > 0 g !");
        aUneErreur = true;
    }
    if (inputCalories.value.trim() === "" || kcal100 < 0) {
        marquerErreur(inputCalories, "Mettre >= 0 kcal !");
        aUneErreur = true;
    }
    if (prot100 < 0) {
        marquerErreur(inputProteines, "Mettre >= 0 g !");
        aUneErreur = true;
    }
    if (prixKg < 0) {
        marquerErreur(inputPrixKg, "Mettre >= 0 € !");
        aUneErreur = true;
    }
    if (aUneErreur) {
        return;
    }

    // 1 g de protéine = 4 kcal : si les protéines dépassent les kcal, c'est une faute de frappe
    const kcalDesProteines = prot100 * 4;
    if (kcalDesProteines > kcal100 + 5) {
        const continuer = confirm(
            `Attention : ${prot100} g de protéines donnent déjà ${kcalDesProteines} kcal, `
            + `mais tu as mis ${kcal100} kcal / 100 g. Vérifie l'étiquette.\n\nAjouter quand même ?`
        );
        if (!continuer) {
            return;
        }
    }

    const indexRepas = parseInt(selectRepas.value, 10) || 0;
    repas[indexRepas].articles.push({
        nom: nomAliment.trim(),
        grammes: grammes,
        kcal100: kcal100,
        prot100: prot100,
        prixKg: prixKg
    });

    await sauvegarder();
    afficher();

    for (const input of tousLesInputs) {
        input.value = "";
    }
    mettreAJourBoutonEffacer();
    messageProduit.classList.add("cache");
});

// =====================================================================
// 7. Ajout d'un repas
// =====================================================================
btnAjouterRepas.addEventListener("click", async function () {
    repas.push({
        nom: "repas " + (repas.length + 1),
        articles: [],
        photoId: null
    });
    await sauvegarder();
    mettreAJourSelectRepas();
    selectRepas.value = repas.length - 1;
    afficher();
});

// =====================================================================
// 8. Photo du repas
// =====================================================================

// Réduit la photo (max 1600 px) pour qu'elle reste légère mais nette
async function compresserPhoto(fichier) {
    const image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
    const tailleMax = 1600;
    const ratio = Math.min(1, tailleMax / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resoudre) => canvas.toBlob(resoudre, "image/jpeg", 0.85));
}

inputPhoto.addEventListener("change", async function () {
    const fichier = inputPhoto.files[0];
    if (!fichier || repasPourPhoto === null || !repas[repasPourPhoto]) {
        return;
    }
    try {
        const blob = await compresserPhoto(fichier);
        const nouvelId = await ajouterPhotoBDD(blob);
        const ancienId = repas[repasPourPhoto].photoId;

        repas[repasPourPhoto].photoId = nouvelId;
        await sauvegarder();

        if (ancienId) {
            await supprimerPhotoBDD(ancienId);
            if (urlsPhotos.has(ancienId)) {
                URL.revokeObjectURL(urlsPhotos.get(ancienId));
                urlsPhotos.delete(ancienId);
            }
        }
        fermerFenetre(fenetrePhoto);
        afficher();
        afficherInfoStockage();
    } catch (e) {
        alert("Impossible d'enregistrer la photo : " + e.message);
    }
});

function ouvrirPhoto(indexRepas) {
    repasPourPhoto = indexRepas;
    chargerImage(photoGrande, repas[indexRepas].photoId);
    fenetrePhoto.classList.remove("cache");
}

function fermerFenetre(fenetre) {
    fenetre.classList.add("cache");
}

document.getElementById("btn-fermer-photo").addEventListener("click", () => fermerFenetre(fenetrePhoto));

document.getElementById("btn-remplacer-photo").addEventListener("click", function () {
    if (!confirm("Es-tu sûr de vouloir remplacer cette photo ?")) {
        return;
    }
    inputPhoto.value = "";
    inputPhoto.click();
});

document.getElementById("btn-supprimer-photo").addEventListener("click", async function () {
    if (repasPourPhoto === null || !confirm("Supprimer cette photo ?")) {
        return;
    }
    const photoId = repas[repasPourPhoto].photoId;
    repas[repasPourPhoto].photoId = null;
    await sauvegarder();
    if (photoId) {
        await supprimerPhotoBDD(photoId);
    }
    fermerFenetre(fenetrePhoto);
    afficher();
    afficherInfoStockage();
});

// =====================================================================
// 9. Scanner de code-barres + Open Food Facts
// =====================================================================
let fluxCamera = null;
let minuteurScan = null;

async function ouvrirScanner() {
    fenetreScanner.classList.remove("cache");
    inputCodeManuel.value = "";

    if (!("BarcodeDetector" in window)) {
        videoScanner.classList.add("cache");
        texteScanner.textContent = "Le scan automatique n'est pas disponible ici. Tape le code-barres.";
        return;
    }

    try {
        fluxCamera = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false
        });
    } catch (e) {
        videoScanner.classList.add("cache");
        texteScanner.textContent = "Caméra refusée ou indisponible. Tape le code-barres.";
        return;
    }

    videoScanner.classList.remove("cache");
    texteScanner.textContent = "Vise le code-barres…";
    videoScanner.srcObject = fluxCamera;
    await videoScanner.play();

    const detecteur = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });

    async function analyser() {
        if (!fluxCamera) {
            return;
        }
        try {
            const codes = await detecteur.detect(videoScanner);
            if (codes.length > 0) {
                const code = codes[0].rawValue;
                if (navigator.vibrate) {
                    navigator.vibrate(80);
                }
                fermerScanner();
                chercherProduit(code);
                return;
            }
        } catch (e) {
            // image pas encore prête : on réessaie
        }
        minuteurScan = setTimeout(analyser, 250);
    }
    analyser();
}

function fermerScanner() {
    clearTimeout(minuteurScan);
    if (fluxCamera) {
        for (const piste of fluxCamera.getTracks()) {
            piste.stop();
        }
        fluxCamera = null;
    }
    videoScanner.srcObject = null;
    fermerFenetre(fenetreScanner);
}

function arrondir(nombre) {
    return Math.round(nombre * 10) / 10;
}

async function chercherProduit(code) {
    code = String(code).trim();
    if (!/^\d{6,14}$/.test(code)) {
        afficherMessageProduit("Code-barres invalide.", "erreur-produit");
        return;
    }

    afficherMessageProduit("Recherche du produit " + code + "…", "info-produit");

    const annulation = new AbortController();
    const delai = setTimeout(() => annulation.abort(), 10000);

    try {
        const adresse = `https://world.openfoodfacts.org/api/v2/product/${code}.json`
            + "?fields=product_name,product_name_fr,brands,nutriments";
        const reponse = await fetch(adresse, { signal: annulation.signal });
        const donnees = await reponse.json();

        if (donnees.status !== 1 || !donnees.product) {
            afficherMessageProduit("Produit introuvable (" + code + "). Remplis à la main.", "erreur-produit");
            return;
        }

        const produit = donnees.product;
        const n = produit.nutriments || {};
        const nom = produit.product_name_fr || produit.product_name || "Produit " + code;
        const marque = produit.brands ? produit.brands.split(",")[0].trim() : "";

        let kcal = n["energy-kcal_100g"];
        if (kcal === undefined && n["energy-kj_100g"] !== undefined) {
            kcal = n["energy-kj_100g"] / 4.184;
        } else if (kcal === undefined && n["energy_100g"] !== undefined) {
            kcal = n["energy_100g"] / 4.184; // energy_100g est en kJ
        }
        const proteines = n["proteins_100g"];

        effacerErreurs();
        inputAliment.value = marque ? `${nom} (${marque})` : nom;
        mettreAJourBoutonEffacer();
        inputCalories.value = kcal !== undefined ? arrondir(kcal) : "";
        inputProteines.value = proteines !== undefined ? arrondir(proteines) : "";

        if (kcal === undefined || proteines === undefined) {
            afficherMessageProduit("Produit trouvé, mais il manque des valeurs : complète à la main.", "erreur-produit");
        } else {
            afficherMessageProduit("✓ " + inputAliment.value + " — indique les grammes.", "ok-produit");
        }
        inputGrammes.focus();
    } catch (e) {
        afficherMessageProduit("Pas de connexion ou serveur lent. Remplis à la main.", "erreur-produit");
    } finally {
        clearTimeout(delai);
    }
}

document.getElementById("btn-scanner").addEventListener("click", ouvrirScanner);
document.getElementById("btn-fermer-scanner").addEventListener("click", fermerScanner);
document.getElementById("btn-code-manuel").addEventListener("click", function () {
    const code = inputCodeManuel.value;
    fermerScanner();
    chercherProduit(code);
});

// =====================================================================
// 10. Exporter / importer une sauvegarde (fichier .json)
// =====================================================================
function blobVersTexte(blob) {
    return new Promise(function (resoudre, rejeter) {
        const lecteur = new FileReader();
        lecteur.onload = () => resoudre(lecteur.result);
        lecteur.onerror = () => rejeter(lecteur.error);
        lecteur.readAsDataURL(blob);
    });
}

// Télécharge un fichier dans le dossier Téléchargements du téléphone
function telechargerFichier(blob, nomFichier) {
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(blob);
    lien.download = nomFichier;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
}

// Donne un fichier à l'utilisateur : partage (Drive, WhatsApp, mail…) ou téléchargement.
// Chrome Android ne partage que certains types de fichiers (.txt oui, .json non) :
// les fichiers à partager sont donc toujours envoyés en .txt.
async function livrerFichier(blob, nomFichier, partager) {
    if (!partager) {
        telechargerFichier(blob, nomFichier);
        return;
    }
    const nomPartage = nomFichier.replace(/\.json$/, ".txt");
    const fichier = new File([blob], nomPartage, { type: "text/plain" });

    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
        try {
            await navigator.share({ files: [fichier] });
            return;
        } catch (e) {
            if (e.name === "AbortError") {
                return; // l'utilisateur a fermé la fenêtre de partage
            }
        }
    }
    // Partage refusé ou impossible : on télécharge à la place
    telechargerFichier(blob, nomFichier);
    alert("Le partage n'a pas marché sur ce téléphone. Le fichier a été mis dans Téléchargements : "
        + "tu peux l'envoyer sur Drive depuis l'appli Drive (bouton + puis Importer).");
}

// ---- Sauvegarde complète (.json) ----
async function exporterSauvegarde(partager) {
    try {
        const jours = await lireTousLesJours();
        const photos = await lireToutesLesPhotos();
        const photosTexte = [];
        for (const photo of photos) {
            photosTexte.push({ id: photo.id, image: await blobVersTexte(photo.blob) });
        }
        const sauvegarde = {
            application: "suivi-repas",
            version: 1,
            exporteLe: new Date().toISOString(),
            jours: jours,
            photos: photosTexte
        };
        const blob = new Blob([JSON.stringify(sauvegarde)], { type: "application/json" });
        await livrerFichier(blob, `suivi-repas-sauvegarde-${formaterDate(new Date())}.json`, partager);
    } catch (e) {
        alert("Erreur pendant l'export : " + e.message);
    }
}

document.getElementById("btn-exporter").addEventListener("click", () => exporterSauvegarde(false));
document.getElementById("btn-partager-sauvegarde").addEventListener("click", () => exporterSauvegarde(true));

// ---- Résumé lisible (.txt) ----
function colonne(texte, largeur, aDroite) {
    texte = String(texte);
    if (texte.length > largeur) {
        texte = texte.slice(0, largeur - 1) + "…";
    }
    return aDroite ? texte.padStart(largeur) : texte.padEnd(largeur);
}

function ligneTableau(nom, g, kcal, prot, prix) {
    return colonne(nom, 28) + " | " + colonne(g, 6, true) + " | " + colonne(kcal, 7, true)
        + " | " + colonne(prot, 7, true) + " | " + colonne(prix, 6, true);
}

async function construireResume(periode) {
    const tousLesJours = await lireTousLesJours();
    let jours;
    let titrePeriode;

    if (periode === "jour") {
        const date = formaterDate(dateCourante);
        jours = tousLesJours.filter((j) => j.date === date);
        titrePeriode = date;
    } else if (periode === "tout") {
        jours = tousLesJours;
        titrePeriode = "tout l'historique";
    } else {
        const nbJours = parseInt(periode, 10);
        const debut = new Date();
        debut.setDate(debut.getDate() - (nbJours - 1));
        const dateDebut = formaterDate(debut);
        const dateFin = formaterDate(new Date());
        jours = tousLesJours.filter((j) => j.date >= dateDebut && j.date <= dateFin);
        titrePeriode = `${dateDebut} → ${dateFin} (${nbJours} derniers jours)`;
    }

    jours.sort((a, b) => a.date.localeCompare(b.date));

    const nomUtilisateur = document.querySelector(".nom-utilisateur").textContent.trim();
    const lignes = [];
    lignes.push(`SUIVI REPAS — ${nomUtilisateur}`);
    lignes.push(`Période : ${titrePeriode}`);
    lignes.push(`Colonnes : aliment | grammes | kcal | protéines (g) | prix (€)`);
    lignes.push("");

    let joursAvecDonnees = 0;
    let sommeKcal = 0;
    let sommeProt = 0;
    let sommePrix = 0;

    for (const jour of jours) {
        const repasRemplis = (jour.repas || []).filter((r) => r.articles && r.articles.length > 0);
        if (repasRemplis.length === 0) {
            continue;
        }
        joursAvecDonnees++;
        let jourKcal = 0;
        let jourProt = 0;
        let jourPrix = 0;

        lignes.push(`==================== ${jour.date} ====================`);
        for (const r of repasRemplis) {
            let rKcal = 0;
            let rProt = 0;
            let rPrix = 0;
            lignes.push(`-- ${r.nom}${r.photoId ? " (avec photo)" : ""} --`);
            lignes.push(ligneTableau("Aliment", "g", "kcal", "prot", "€"));
            for (const a of r.articles) {
                const kcal = (a.grammes * a.kcal100) / 100;
                const prot = (a.grammes * a.prot100) / 100;
                const prix = (a.grammes * a.prixKg) / 1000;
                rKcal += kcal;
                rProt += prot;
                rPrix += prix;
                lignes.push(ligneTableau(a.nom, a.grammes, kcal.toFixed(1), prot.toFixed(1), prix.toFixed(2)));
            }
            lignes.push(ligneTableau("Sous-total " + r.nom, "", rKcal.toFixed(1), rProt.toFixed(1), rPrix.toFixed(2)));
            lignes.push("");
            jourKcal += rKcal;
            jourProt += rProt;
            jourPrix += rPrix;
        }
        lignes.push(ligneTableau("TOTAL DU JOUR", "", jourKcal.toFixed(1), jourProt.toFixed(1), jourPrix.toFixed(2)));
        lignes.push("");
        sommeKcal += jourKcal;
        sommeProt += jourProt;
        sommePrix += jourPrix;
    }

    if (joursAvecDonnees === 0) {
        lignes.push("Aucun repas enregistré sur cette période.");
    } else if (joursAvecDonnees > 1) {
        lignes.push("==================== BILAN ====================");
        lignes.push(`Jours avec des repas : ${joursAvecDonnees}`);
        lignes.push(`Total : ${sommeKcal.toFixed(0)} kcal | ${sommeProt.toFixed(1)} g prot | ${sommePrix.toFixed(2)} €`);
        lignes.push(`Moyenne par jour : ${(sommeKcal / joursAvecDonnees).toFixed(0)} kcal | `
            + `${(sommeProt / joursAvecDonnees).toFixed(1)} g prot | ${(sommePrix / joursAvecDonnees).toFixed(2)} €`);
    }

    return lignes.join("\n");
}

async function exporterResume(partager) {
    try {
        const periode = document.getElementById("select-periode").value;
        const texte = await construireResume(periode);
        const blob = new Blob([texte], { type: "text/plain" });
        const suffixe = periode === "jour" ? formaterDate(dateCourante) : periode + "-jours-" + formaterDate(new Date());
        const nom = periode === "tout"
            ? `suivi-repas-resume-tout-${formaterDate(new Date())}.txt`
            : `suivi-repas-resume-${suffixe}.txt`;
        await livrerFichier(blob, nom, partager);
    } catch (e) {
        alert("Erreur pendant la création du résumé : " + e.message);
    }
}

document.getElementById("btn-resume-telecharger").addEventListener("click", () => exporterResume(false));
document.getElementById("btn-resume-partager").addEventListener("click", () => exporterResume(true));

// Les boutons "Partager" n'apparaissent que si le téléphone sait partager des fichiers
if (!navigator.canShare) {
    for (const btn of document.querySelectorAll(".btn-partager")) {
        btn.classList.add("cache");
    }
}

document.getElementById("btn-importer").addEventListener("click", function () {
    inputImport.value = "";
    inputImport.click();
});

inputImport.addEventListener("change", async function () {
    const fichier = inputImport.files[0];
    if (!fichier) {
        return;
    }
    try {
        const sauvegarde = JSON.parse(await fichier.text());
        if (sauvegarde.application !== "suivi-repas" || !Array.isArray(sauvegarde.jours)) {
            alert("Ce fichier n'est pas une sauvegarde de Suivi Repas.");
            return;
        }
        if (!confirm(`Importer ${sauvegarde.jours.length} jour(s) ? Les jours déjà présents avec la même date seront remplacés.`)) {
            return;
        }

        // Les photos reçoivent de nouveaux numéros : on garde la correspondance
        const correspondance = new Map();
        for (const photo of sauvegarde.photos || []) {
            const blob = await (await fetch(photo.image)).blob();
            correspondance.set(photo.id, await ajouterPhotoBDD(blob));
        }

        for (const jour of sauvegarde.jours) {
            for (const r of jour.repas) {
                r.photoId = r.photoId ? (correspondance.get(r.photoId) || null) : null;
            }
            await ecrireJour(jour.date, jour.repas);
        }

        alert("Import terminé ✓");
        await chargerJour();
        afficherInfoStockage();
    } catch (e) {
        alert("Fichier illisible : " + e.message);
    }
});

// =====================================================================
// 11. Navigation entre les jours
// =====================================================================
let numeroChargement = 0;

async function chargerJour() {
    const ceChargement = ++numeroChargement;
    const date = formaterDate(dateCourante);
    document.getElementById("date-affichage").textContent = date;

    const donnees = await lireJour(date);
    if (ceChargement !== numeroChargement) {
        return; // un autre jour a été demandé entre-temps
    }

    for (const url of urlsPhotos.values()) {
        URL.revokeObjectURL(url);
    }
    urlsPhotos.clear();

    repas.length = 0;
    if (donnees && donnees.repas && donnees.repas.length > 0) {
        repas.push(...donnees.repas);
    } else {
        repas.push({ nom: "repas 1", articles: [], photoId: null });
    }

    mettreAJourSelectRepas();
    afficher();
}

document.getElementById("btn-jour-prec").addEventListener("click", function () {
    dateCourante.setDate(dateCourante.getDate() - 1);
    chargerJour();
});

document.getElementById("btn-jour-suiv").addEventListener("click", function () {
    dateCourante.setDate(dateCourante.getDate() + 1);
    chargerJour();
});

// Quand on revient sur l'appli après minuit, on passe au nouveau jour
document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") {
        return;
    }
    const aujourdhui = formaterDate(new Date());
    if (aujourdhui !== jourReel) {
        const afficheAujourdhui = formaterDate(dateCourante) === jourReel;
        jourReel = aujourdhui;
        if (afficheAujourdhui) {
            dateCourante = new Date();
            chargerJour();
        }
    }
});

// =====================================================================
// 12. Démarrage
// =====================================================================
async function demarrer() {
    try {
        bdd = await ouvrirBDD();
        await migrerAnciennesDonnees();
        await chargerJour();
        protegerStockage();
    } catch (e) {
        alert("Impossible d'ouvrir la base de données : " + e.message);
    }

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").catch(function (e) {
            console.log("Service worker non enregistré :", e);
        });
    }
}

demarrer();
