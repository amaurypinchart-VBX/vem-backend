# 📧 Fiche mémo — Envoyer un mail à VEM

**Adresse : warehouseviewbox@gmail.com**

VEM relève cette boîte **toutes les 5 minutes**. Il ne traite que les mails **non lus** et ne répond **jamais** à l'expéditeur (ni accusé de réception, ni message d'erreur).

---

## 🆕 CRÉER un nouveau projet

**Le sujet COMMENCE par `NEW`**, suivi du N° interne. Majuscules ou minuscules : peu importe.

| Sujet | Résultat |
|---|---|
| ✅ `NEW 9999DEMOVIE` | Projet créé, N° interne 9999DEMOVIE |
| ✅ `new: 9999DEMOVIE` · `NEW - 9999DEMOVIE` | Idem |
| ❌ `TR: NEW 9999DEMOVIE` · `Fwd: NEW …` | Ne commence pas par NEW → mail ignoré. **Effacez « TR: » / « Fwd: »** |
| ❌ `NEW 9999DEMOVIE` quand le projet existe déjà | Rien n'est créé |

**Ce qui se passe**
- L'IA lit le mail et remplit : nom, client, contact, adresse, dates, nombre d'ouvriers, description.
- Le projet est créé en **📄 Brouillon**. Si le client n'est pas reconnu, il est rattaché à **« ⚠️ Client à confirmer »** (ou un nouveau client est créé).
- Toutes les pièces jointes vont dans **📁 Fichiers**.
- Les admins et Project Managers reçoivent la notification **« 🆕 Projet créé depuis un email »**.

**Modèle de mail à copier** (remplacez chaque `[…]`, effacez les lignes inconnues) :

```
Objet : NEW [N° interne]

Bonjour,

Merci de créer le projet suivant dans VEM.

NOM DU PROJET : [nom court et lisible, ex. « Viewbox Klokgebouw Eindhoven »]
N° INTERNE : [4 chiffres + 4 à 6 lettres + VIE]
CLIENT (société finale) : [nom exact du client, comme dans VEM]
CONTACT CLIENT : [prénom nom]
E-MAIL DU CONTACT : [adresse e-mail]
TÉLÉPHONE DU CONTACT : [numéro]
ADRESSE DU SITE : [rue, numéro, code postal, ville]
VILLE : [ville du site]
INSTALLATION : du [JJ/MM/AAAA] au [JJ/MM/AAAA]
DÉMONTAGE : du [JJ/MM/AAAA] au [JJ/MM/AAAA]
NOMBRE D'OUVRIERS : [nombre]
DESCRIPTION DU MONTAGE : [nombre de Viewbox, modules (HVAC…), équipement fourni]
INSTRUCTIONS / LOGISTIQUE : [transport, accès au site, horaires, disponibilité du client…]

Pièces jointes : plans, devis, bon de commande…

Merci !
```

- Dates avec l'année ; les heures ne sont pas reprises.
- Client écrit exactement comme dans VEM, sinon un nouveau client est créé (doublon).

**Version anglaise** (pour les collègues et partenaires qui écrivent en anglais) :

```
Subject: NEW [internal number]

Hello,

Please create the following project in VEM.

PROJECT NAME: [short, readable name, e.g. "Viewbox Klokgebouw Eindhoven"]
INTERNAL NUMBER: [4 digits + 4 to 6 letters + VIE]
CLIENT (end customer): [exact client name, as in VEM]
CLIENT CONTACT: [first name last name]
CONTACT E-MAIL: [e-mail address]
CONTACT PHONE: [number]
SITE ADDRESS: [street, number, postcode, city]
CITY: [site city]
INSTALLATION: from [DD/MM/YYYY] to [DD/MM/YYYY]
DISMANTLING: from [DD/MM/YYYY] to [DD/MM/YYYY]
NUMBER OF WORKERS: [number]
SCOPE OF WORK: [number of Viewbox, modules (HVAC…), equipment supplied]
INSTRUCTIONS / LOGISTICS: [transport, site access, working hours, client availability…]

Attachments: drawings, quote, purchase order…

Thank you!
```

**Ensuite, vérifiez obligatoirement** (✏️ Modifier) :
1. Les **dates** : sans date dans le mail, l'installation est mise à la date du jour.
2. Le client, le N° interne et l'adresse.
3. Les 3 notes (globales, installation, démontage) : elles ne sont jamais remplies par le mail.
4. Le statut, puis l'équipe, la logistique et les bookings.

---

## 📧 COMPLÉTER un projet existant

**Le N° interne du projet figure N'IMPORTE OÙ dans le sujet** (et le sujet ne commence pas par NEW).

| Sujet | Résultat |
|---|---|
| ✅ `9999DEMOVIE` | Pièces jointes → Fichiers |
| ✅ `Plans façade 9999DEMOVIE v2` | Idem |
| ✅ `TR: Confirmation camion 9999DEMOVIE` | Camion lu dans le texte → brouillon |
| ❌ `Photos chantier Paddock` | Pas de N° interne → mail ignoré |
| ❌ `Photos 9999DEMOVI` | N° incomplet → ignoré |

**Ce qui se passe**
- **Pièces jointes** → 📁 Fichiers, **toutes**, y compris les logos et signatures du mail : faites le ménage.
- **Texte du mail** → l'IA crée en **brouillon**, avec la note « 📧 Créé auto depuis mail — à valider » :
  - les camions et engins dans 🚛 Logistique ;
  - les hôtels dans ✈️ Bookings (sans occupant) ;
  - les trajets dans ✈️ Bookings, **seulement si la personne est déjà dans l'onglet 👥 Équipe** du projet.
- Le texte du mail **n'est pas ajouté aux notes** du projet.
- Notification **« 🚛 Réservations créées depuis un email »** aux admins et Project Managers.

**Valider les brouillons** : ✏️ sur la carte → compléter → 💾 Enregistrer.
- Camion : le statut passe à 🟣 Planifié.
- Hôtel : cochez les occupants.
- Trajet : re-choisissez le moyen de transport.

---

## ❓ Rien n'est apparu ?

1. Attendez 5 à 10 minutes et **rechargez** la page.
2. Vérifiez le sujet : NEW au tout début (création) ou N° interne exact (projet existant).
3. Le mail a-t-il été **ouvert dans la boîte Gmail** avant la relève ? S'il n'est plus « non lu », il n'est jamais traité.
4. Fichier trop lourd (au-delà de 10 Mo environ) ? Utilisez 🔗 URL dans 📁 Fichiers.
5. Toujours rien : renvoyez le mail avec le bon sujet, ou ajoutez à la main (⬆️ Ajouter).

**Format du N° interne Viewbox** : 4 chiffres + 4 à 6 lettres + VIE (ex. `6055RKLOKVIE`).

**Où trouver l'adresse dans VEM** : onglet 📋 Infos du projet › encadré « Envoyer des fichiers par email » › 📋 Copier.
