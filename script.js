console.log("Connexion HTML <-> JS réussie");

// 1. Récupération des éléments HTML
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

// Mémorisation des placeholders d'origine au chargement
for (const input of tousLesInputs) {
    input.dataset.original = input.placeholder;
}

// 2. Fonctions utilitaires (erreurs et popup)
function marquerErreur(input, message) {
    input.value = "";
    input.placeholder = message;
    input.classList.add("erreur");
}

function afficherPopup(evenement, texte, estRepas = false) {
    evenement.stopPropagation();
    const rect = evenement.target.getBoundingClientRect();

    popupInfo.textContent = texte;
    popupInfo.classList.toggle("popup-repas", estRepas);
    popupInfo.classList.remove("popup-cache");

    let leftPos;
    let topPos;

    if (estRepas) {
        // Centré horizontalement par rapport au bandeau bleu, affiché vers le bas
        leftPos = rect.left + (rect.width - popupInfo.offsetWidth) / 2;
        topPos = rect.bottom + 8;

        // Sécurité : si le repas est tout en bas de l'écran, on bascule au-dessus
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

// 3. Données et affichage multi-repas
const repas = [];

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

        // Bandeau du repas (repas 1, repas 2, etc.)
        const trBandeau = document.createElement("tr");
        const tdBandeau = document.createElement("td");
        tdBandeau.colSpan = 6;
        tdBandeau.className = "bandeau-repas";
        tdBandeau.textContent = repas[m].nom;

        tdBandeau.addEventListener("click", function (e) {
            const resume = `${repas[m].nom.toUpperCase()} : ${repasKcal.toFixed(2)} kcal | ${repasProt.toFixed(2)} g prot | ${repasPrix.toFixed(2)} €`;
            afficherPopup(e, resume, true);
        });

        if (repas.length > 1) {
            const btnSupprRepas = document.createElement("button");
            btnSupprRepas.textContent = "✕";
            btnSupprRepas.type = "button";
            btnSupprRepas.className = "btn-suppr-repas";
            btnSupprRepas.title = "Supprimer ce repas";

            btnSupprRepas.addEventListener("click", function (e) {
                e.stopPropagation();
                if (!confirm(`Es-tu sûr de vouloir supprimer ${repas[m].nom} ?`)) {
                    return;
                }
                popupInfo.classList.add("popup-cache");
                repas.splice(m, 1);
                for (let k = 0; k < repas.length; k++) {
                    repas[k].nom = "repas " + (k + 1);
                }
                sauvegarder();
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
            tdPrixCalc.classList.add("cellule-cliquable");
            tdPrixCalc.addEventListener("click", function (e) {
                afficherPopup(e, article.prixKg.toFixed(2) + " €/kg");
            });

            const tdSuppr = document.createElement("td");
            const btnSuppr = document.createElement("button");
            btnSuppr.textContent = "✕";
            btnSuppr.type = "button";

            btnSuppr.addEventListener("click", function () {
                repas[m].articles.splice(i, 1);
                sauvegarder();
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
}
// 4. Ajout d'un article dans le repas sélectionné
bouton.addEventListener("click", function () {
    const nomAliment = inputAliment.value;
    const grammes = parseFloat(inputGrammes.value) || 0;
    const kcal100 = parseFloat(inputCalories.value) || 0;
    const prot100 = parseFloat(inputProteines.value) || 0;
    const prixKg = parseFloat(inputPrixKg.value) || 0;

    for (const input of tousLesInputs) {
        input.classList.remove("erreur");
        input.placeholder = input.dataset.original;
    }

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

    const indexRepas = parseInt(selectRepas.value, 10) || 0;
    repas[indexRepas].articles.push({
        nom: nomAliment.trim(),
        grammes: grammes,
        kcal100: kcal100,
        prot100: prot100,
        prixKg: prixKg
    });

    sauvegarder();
    afficher();

    for (const input of tousLesInputs) {
        input.value = "";
    }
});

// 5. Ajout d'un nouveau repas (repas 2, repas 3, etc.)
btnAjouterRepas.addEventListener("click", function () {
    const numero = repas.length + 1;
    repas.push({
        nom: "repas " + numero,
        articles: []
    });
    sauvegarder();
    mettreAJourSelectRepas();
    selectRepas.value = repas.length - 1;
    afficher();
});

// 6. Gestion des dates et sauvegarde par jour
let dateCourante = new Date();

function formaterDate(date) {
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, "0");
    const jour = String(date.getDate()).padStart(2, "0");
    return `${annee}-${mois}-${jour}`;
}

function cleDuJour() {
    return "jour-" + formaterDate(dateCourante);
}

function sauvegarder() {
    localStorage.setItem(cleDuJour(), JSON.stringify(repas));
}

function chargerJour() {
    document.getElementById("date-affichage").textContent = formaterDate(dateCourante);

    repas.length = 0;
    const donnees = JSON.parse(localStorage.getItem(cleDuJour()));

    if (!donnees || donnees.length === 0) {
        repas.push({ nom: "repas 1", articles: [] });
    } else if (donnees[0].articles !== undefined) {
        repas.push(...donnees);
    } else {
        repas.push({ nom: "repas 1", articles: donnees });
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

// Chargement initial au démarrage de la page
chargerJour();