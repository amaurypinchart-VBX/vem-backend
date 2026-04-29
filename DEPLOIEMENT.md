# VEM — Guide de déploiement complet

## Ce que tu auras en ligne

- ✅ API REST complète (projets, tâches, tickets, handover, daily reports, entrepôt)
- ✅ Upload photos → Cloudinary (gratuit jusqu'à 25GB)
- ✅ Génération PDF (handover + daily report)
- ✅ Envoi emails automatiques (Gmail SMTP)
- ✅ Base de données PostgreSQL
- ✅ Temps réel via Socket.IO
- ✅ Interface HTML prototype servie par le même serveur

---

## ÉTAPE 1 — Créer les comptes gratuits

### 1.1 GitHub (pour héberger le code)
→ https://github.com/signup
Créer un compte si tu n'en as pas.

### 1.2 Railway (serveur + base de données)
→ https://railway.app
- Cliquer "Start a New Project"
- Se connecter avec GitHub

### 1.3 Cloudinary (upload photos)
→ https://cloudinary.com/users/register_free
- Créer compte gratuit (25GB offerts)
- Noter : Cloud Name, API Key, API Secret (dans le Dashboard)

### 1.4 Gmail — Mot de passe d'application (pour emails)
→ https://myaccount.google.com/security
- Activer la validation en 2 étapes
- Chercher "Mots de passe des applications"
- Créer un mot de passe pour "VEM App"
- Copier le mot de passe généré (format : xxxx xxxx xxxx xxxx)

---

## ÉTAPE 2 — Mettre le code sur GitHub

```bash
# Dans le dossier backend/
git init
git add .
git commit -m "VEM initial commit"
git branch -M main

# Créer un repo sur github.com/new (nom : vem-backend)
git remote add origin https://github.com/TON-PSEUDO/vem-backend.git
git push -u origin main
```

---

## ÉTAPE 3 — Déployer sur Railway

### 3.1 Créer le projet
1. railway.app → "New Project"
2. "Deploy from GitHub repo"
3. Sélectionner `vem-backend`
4. Railway détecte automatiquement le Dockerfile

### 3.2 Ajouter PostgreSQL
1. Dans ton projet Railway → "+ Add Service"
2. "Database" → "PostgreSQL"
3. Railway crée la DB et ajoute `DATABASE_URL` automatiquement

### 3.3 Configurer les variables d'environnement
Dans Railway → ton service → "Variables" → ajouter :

```
NODE_ENV=production
JWT_SECRET=VEM2025SuperSecretChangeMe32chars!
JWT_REFRESH_SECRET=VEM2025RefreshSecretChangeMe32ch!
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ton-email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
EMAIL_FROM_NAME=VEM - ViewBox Event Manager
CLOUDINARY_CLOUD_NAME=ton-cloud-name
CLOUDINARY_API_KEY=ton-api-key
CLOUDINARY_API_SECRET=ton-api-secret
TICKET_ESCALATION_HOURS=24
```

### 3.4 Obtenir l'URL publique
Railway → Settings → Domains → "Generate Domain"
→ Tu obtiens : `https://vem-backend-production.up.railway.app`

Ajoute cette variable :
```
APP_URL=https://vem-backend-production.up.railway.app
```

### 3.5 Initialiser la base de données
Dans Railway → ton service → "Shell" (ou via CLI) :
```bash
npx ts-node prisma/seed.ts
```

OU depuis ta machine en local :
```bash
DATABASE_URL="ta-database-url-railway" npx ts-node prisma/seed.ts
```

---

## ÉTAPE 4 — Héberger l'interface HTML

### Option A — Sur le même serveur Railway (recommandé)
Copier `index.html` dans un dossier `public/` à la racine du backend :
```
backend/
├── public/
│   └── index.html   ← ton interface
├── src/
└── ...
```

L'interface sera accessible à : `https://ton-app.railway.app`
L'API sera à : `https://ton-app.railway.app/api/v1`

### Option B — Sur Netlify (séparé)
1. Netlify Drop → glisser `index.html`
2. Dans le HTML, changer l'URL de l'API :
   ```javascript
   const API_BASE = 'https://ton-app.railway.app/api/v1';
   ```

---

## ÉTAPE 5 — Connecter l'interface à l'API

Ouvrir `index.html` et ajouter en haut du `<script>` :

```javascript
const API = 'https://ton-app.railway.app/api/v1';
let TOKEN = localStorage.getItem('vem_token') || '';

// Wrapper fetch avec auth
async function api(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// Login au démarrage
async function login(email, password) {
  const r = await api('POST', '/auth/login', { email, password });
  if (r.success) {
    TOKEN = r.data.token;
    localStorage.setItem('vem_token', TOKEN);
    return r.data.user;
  }
}
```

---

## Comptes de connexion (après seed)

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| admin@vem.com | Admin@VEM2025! | Admin |
| amaury.pinchart@vem.com | VEM2025! | Technical Manager |
| jeremy.berrutto@vem.com | VEM2025! | Site Manager |
| norick.palm@vem.com | VEM2025! | Engineer |

---

## Coûts

| Service | Plan gratuit |
|---------|-------------|
| Railway | 5$/mois crédit offert (suffit pour un MVP) |
| PostgreSQL | Inclus dans Railway |
| Cloudinary | 25GB gratuit |
| Gmail SMTP | Gratuit |
| **Total** | **0€/mois au départ** |

---

## En cas de problème

### L'app ne démarre pas
→ Railway → Logs → chercher le message d'erreur

### "Cannot connect to database"
→ Vérifier que DATABASE_URL est bien configurée dans Railway

### Emails non envoyés
→ Vérifier SMTP_USER et SMTP_PASS dans Railway
→ Gmail : le mot de passe doit être un "mot de passe d'application"

### Photos non uploadées
→ Vérifier les 3 variables CLOUDINARY_* dans Railway

---

## Test de l'API (Postman ou curl)

```bash
# Login
curl -X POST https://ton-app.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vem.com","password":"Admin@VEM2025!"}'

# Récupérer les projets (avec token)
curl https://ton-app.railway.app/api/v1/projects \
  -H "Authorization: Bearer TON_TOKEN"

# Health check
curl https://ton-app.railway.app/health
```
