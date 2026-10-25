# 📧 Quick reference — Sending an email to VEM

> VEM's screens are in French: button and field names are given exactly as they appear, with the English meaning in brackets.

**Address: warehouseviewbox@gmail.com**

VEM checks this mailbox **every 5 minutes**. It only processes **unread** emails and **never** replies to the sender (no acknowledgement, no error message).

---

## 🆕 CREATE a new project

**The subject STARTS with `NEW`**, followed by the internal number. Upper or lower case: doesn't matter.

| Subject | Result |
|---|---|
| ✅ `NEW 9999DEMOVIE` | Project created, internal number 9999DEMOVIE |
| ✅ `new: 9999DEMOVIE` · `NEW - 9999DEMOVIE` | Same |
| ❌ `FW: NEW 9999DEMOVIE` · `Fwd: NEW …` · `TR: NEW …` | Does not start with NEW → email ignored. **Delete « FW: » / « Fwd: » / « TR: »** |
| ❌ `NEW 9999DEMOVIE` when the project already exists | Nothing is created |

**What happens**
- The AI reads the email and fills in: name, client, contact, address, dates, number of workers, description.
- The project is created as **📄 Brouillon** (draft). If the client is not recognised, it is linked to **« ⚠️ Client à confirmer »** (client to confirm), or a new client is created.
- All attachments go to **📁 Fichiers** (files).
- Admins and Project Managers get the notification **« 🆕 Projet créé depuis un email »** (project created from an email).

**Email template to copy** (replace every `[…]`, delete the lines you don't know):

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

- Dates with the year; times are not kept.
- Client name written exactly as in VEM, otherwise a new (duplicate) client is created.

**French version** (for French-speaking colleagues and partners):

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

**Then always check** (✏️ Modifier — edit):
1. The **dates**: with no date in the email, installation is set to today.
2. The client, the internal number and the address.
3. The 3 notes (global, installation, dismantling): they are never filled in by the email.
4. The status, then the team, logistics and bookings.

---

## 📧 ADD TO an existing project

**The project's internal number appears ANYWHERE in the subject** (and the subject does not start with NEW).

| Subject | Result |
|---|---|
| ✅ `9999DEMOVIE` | Attachments → Fichiers |
| ✅ `Facade drawings 9999DEMOVIE v2` | Same |
| ✅ `FW: Truck confirmation 9999DEMOVIE` | Truck read from the text → draft |
| ❌ `Site photos Paddock` | No internal number → email ignored |
| ❌ `Photos 9999DEMOVI` | Incomplete number → ignored |

**What happens**
- **Attachments** → 📁 Fichiers, **all of them**, including email logos and signatures: tidy up afterwards.
- **Email text** → the AI creates **drafts**, with the note « 📧 Créé auto depuis mail — à valider » (created automatically from an email — to approve):
  - trucks and machines in 🚛 Logistique (logistics);
  - hotels in ✈️ Bookings (with no occupant);
  - trips in ✈️ Bookings, **only if the person is already in the project's 👥 Équipe (team) tab**.
- The email text is **not added to the project notes**.
- Notification **« 🚛 Réservations créées depuis un email »** (bookings created from an email) to admins and Project Managers.

**Approving the drafts**: ✏️ on the card → complete → 💾 Enregistrer (save).
- Truck: the status changes to 🟣 Planifié (planned).
- Hotel: tick the occupants.
- Trip: choose the means of transport again.

---

## ❓ Nothing appeared?

1. Wait 5 to 10 minutes and **reload** the page.
2. Check the subject: NEW at the very start (create) or the exact internal number (existing project).
3. Was the email **opened in the Gmail mailbox** before VEM checked it? If it is no longer "unread", it is never processed.
4. File too big (above about 10 MB)? Use 🔗 URL in 📁 Fichiers.
5. Still nothing: send the email again with the right subject, or add by hand (⬆️ Ajouter — add).

**Viewbox internal number format**: 4 digits + 4 to 6 letters + VIE (e.g. `6055RKLOKVIE`).

**Where to find the address in VEM**: project tab 📋 Infos › box « Envoyer des fichiers par email » (send files by email) › 📋 Copier (copy).
