import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';
import { MAIL } from './m03-mail-new.mjs';

export const MATRICE = [
  ['Quote', 'Sales / Customer Service', 'Client + contacts · project (internal number, address, dates) · status Devis à valider', 'Form or NEW e-mail', 'PM, TM'],
  ['Quote approved', 'Sales / PM', 'Status Devis validé · description · global notes · drawings and quote in Fichiers', 'Form, internal number e-mail', 'The whole team'],
  ['Preparation', 'PM / TM', 'Team + phases · trucks & machinery · transport & hotels · installation / dismantling notes · checklists configured', 'Tabs, internal number e-mail', 'Warehouse, team, calendar'],
  ['Departure', 'PM / TM', 'Preparation checklist · Studio briefing (🪄) · PDF sent to the team · 📤 info to each member', 'Studio, 📤', 'Field team'],
  ['Installation', 'Site Manager', 'Status Sur site / En installation · installation checklist every day · daily report every day · photos', 'Phone, internal number e-mail', 'PM, client, report'],
  ['Handover', 'Site Manager / TM', 'Checklist completed · handover + signature · status Handover OK', 'Handover tab, 🔗 link', 'Client, management'],
  ['Dismantling', 'Site Manager', 'Status Démontage · dismantling checklist · daily reports · trucks → Retour entrepôt', 'Phone', 'Warehouse, PM'],
  ['Closing', 'PM', 'AI report · tidy up Fichiers · status Terminé', 'Project sheet', 'Management'],
];

export default {
  key: 'pratique', num: 16, icon: '🏁', title: 'Practice & troubleshooting',
  public: 'Everyone', duree: '30 min', parcours: 'Core track',
  slides: [
    {
      title: 'Who fills in what, when',
      body: () => table(['Phase', 'Who', 'What', 'Channel', 'Used by'], MATRICE, { small: true }),
      visual: 'Matrix phase × who × what × channel × users.',
      notes: 'The same matrix is detailed in 01_PLAN_PEDAGOGIQUE.md.',
    },
    {
      title: 'The demo project from start to finish',
      body: () => `<div class="flow">${[
        ['1', 'Client', 'Demo Events SA + Jean Exemple ★'],
        ['2', 'Project', `${FIL.ref}, dates, address, notes`],
        ['3', 'Team', 'Paul, Marie, Luc + phases'],
        ['4', 'Logistics', `Truck ${FIL.camion}, crane`],
        ['5', 'Bookings', `Train + ${FIL.hotel}`],
        ['6', 'Checklists', 'Preparation + installation'],
        ['7', 'Briefing', '🪄 + PDF to the team'],
        ['8', 'On site', 'Daily + checklist every day'],
        ['9', 'Handover', 'Signature 🔗 + Handover OK'],
        ['10', 'Closing', 'AI report + Terminé'],
      ].map(([n, t, s]) => `<div class="flow-step"><div class="ft">${n}. ${t}</div><div class="fs">${s}</div></div>`).join('')}</div>`
        + callout('tip', 'Final exercise (45 min, in pairs): go through these 10 steps on a test project, then compare your briefings.'),
      visual: '10-step timeline.',
      notes: 'For the final exercise, have each pair create a test project with a different fictitious internal number.',
    },
    {
      title: 'FAQ — troubleshooting (1/2)',
      body: () => table(['Problem', 'What to do'], [
        ['My e-mail created nothing', 'Wait 10 min and reload. Check: subject starting with NEW (creation) or exact internal number (existing project), no « TR: » / « Fwd: » before NEW, e-mail not opened in the Gmail inbox. Otherwise: resend with the right subject or add by hand.'],
        ['The client is « ⚠️ Client à confirmer »', `${L('✏️ Modifier')} the project › ${L('Client *')}: choose or create the right client.`],
        ['The dates of the project created by e-mail are wrong', 'The e-mail contained no date: correct them in ✏️ Modifier.'],
        ['My trip sent by e-mail was not created', 'The person was not in the 👥 Équipe tab: add them, then enter the trip by hand.'],
        ['The status list is empty', 'The project is in Brouillon or Confirmé: simply choose the right status.'],
      ], { small: true }),
      visual: 'Problem / solution table.',
      notes: '',
    },
    {
      title: 'FAQ — troubleshooting (2/2)',
      body: () => table(['Problem', 'What to do'], [
        ['I am sent back to the sign-in screen', 'A session lasts 8 h: sign in again. Reload the page if the display looks odd.'],
        ['I forgot my password', 'Ask an admin, a Project or Technical Manager for « 📧 Envoyer invitation » (valid 15 min).'],
        ['« Permission insuffisante »', 'Action reserved for certain roles: ask an admin or your manager.'],
        ['I cannot see a project', 'Site Manager, installer, worker: you must be in the project\'s 👥 Équipe tab.'],
        ['I cannot see the checklist (Site Manager / installer)', 'You must be in the project\'s 👥 Équipe tab.'],
        ['The signature link is blocked', 'Finish the installation checklist (critical points, « À vérifier » points).'],
        ['My 3 photos became 1 (phone)', 'Select all the photos at once, or add them when editing.'],
        ['My edited vehicle did not change', 'Edit it in the 🚛 Logistique tab, not in ✏️ Modifier.'],
      ], { small: true }),
      visual: 'Problem / solution table.',
      notes: '',
    },
    {
      kind: 'memo', key: 'memo-mail', title: 'Memo sheet — the e-mail rule',
      body: () => `<div class="memo">
        <div class="memo-addr">📧 ${MAIL}</div>
        <div class="memo-grid">
          <div class="memo-col new"><h3>🆕 CREATE a project</h3>
            <p>The subject <b>starts with</b> <code>NEW</code> + internal number.</p>
            <p class="ex ok">✅ NEW ${FIL.ref}</p><p class="ex ok">✅ new: ${FIL.ref}</p>
            <p class="ex ko">❌ TR: NEW ${FIL.ref} <small>(delete TR: / Fwd:)</small></p>
            <p class="ex ko">❌ NEW for a project that already exists</p>
            <p><b>Result</b>: draft project + attachments. <b>To check</b>: client, address, <b>dates</b>, notes, status.</p></div>
          <div class="memo-col add"><h3>📧 COMPLETE a project</h3>
            <p>The <b>internal number</b> anywhere in the subject.</p>
            <p class="ex ok">✅ Façade drawings ${FIL.ref}</p><p class="ex ok">✅ Fwd: Truck confirmation ${FIL.ref}</p>
            <p class="ex ko">❌ Site photos Paddock <small>(no number)</small></p>
            <p><b>Result</b>: attachments → 📁 Fichiers; trucks, hotels, trips → drafts to approve. <b>Not</b> added to the notes.</p></div>
        </div>
        <div class="memo-foot">⏱ Checked every 5 min · never open these e-mails in the Gmail inbox · no message if it fails · internal number = 4 digits + 4 to 6 letters + VIE</div></div>`,
      visual: 'Memo sheet printable on one page (A4 landscape).',
      notes: 'Print this slide on its own (Ctrl+P, current page) or use 03_FICHE_MEMO_MAIL.md.',
    },
    {
      kind: 'cover', title: 'Thank you!',
      body: () => `<div class="cover-sub">Questions?</div><div class="cover-line">The deck stays available: ☰ Sommaire (contents) to find a chapter, direct link per chapter to share.</div>`,
      visual: 'End slide.',
      notes: 'Remind everyone of the 6 golden rules and where to find the memo sheet.',
    },
  ],
};
