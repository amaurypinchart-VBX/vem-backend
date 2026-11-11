// Liste des écrans visités par les outils de contrôle (audit.mjs, desktop-shots.mjs) :
// pages, onglets du projet, fenêtres. `snap(key)` est appelé sur chaque écran.
// `opts.readOnly` : n'ouvre que ce qui ne modifie rien en base (captures ordinateur
// comparées avant / après, la base doit rester identique entre deux passages).

export async function visitScreens(page, BASE, snap, opts = {}) {
  const home = async () => { await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };

  await home();
  await snap('dashboard');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await snap('dashboard-bas');
  for (const pg of ['projects', 'tasks', 'daily', 'handover', 'templates', 'checklist-templates', 'clients', 'team', 'notifs']) {
    await page.evaluate(p => goto(p), pg); await page.waitForTimeout(900);
    await snap('page-' + pg);
  }

  const pid = await page.evaluate(() => (PROJECTS.find(p => /Audi/.test(p.name)) || PROJECTS[0])?.id);
  await page.evaluate(id => openProject(id), pid); await page.waitForTimeout(1500);
  await snap('projet-entete');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#proj-tabs .tab')].filter(t => t.style.display !== 'none').map(t => t.textContent.trim()));
  for (let i = 0; i < tabs.length; i++) {
    await page.evaluate(i => [...document.querySelectorAll('#proj-tabs .tab')].filter(t => t.style.display !== 'none')[i].click(), i);
    await page.waitForTimeout(1300);
    await page.evaluate(() => document.getElementById('proj-tabs')?.scrollIntoView());
    await snap('onglet-' + i + '-' + tabs[i].normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 14));
  }

  const DID = await page.evaluate(async () => (await api('GET', '/daily-reports'))?.data?.[0]?.id);
  const HID = await page.evaluate(async id => (await api('GET', '/handover?projectId=' + id))?.data?.[0]?.id, pid);
  const flows = [
    ['daily-nouveau', `showModal('modal-daily')`],
    ['daily-lecture', `openDailyDetail('${DID}', '${pid}')`],
    ['daily-edition', `editDailyReport('${DID}')`],
    ['projet-nouveau', `showModal('modal-proj')`],
    ['tache-nouvelle', `showModal('modal-task')`],
    ['handover-nouveau', `showModal('modal-handover')`],
    ...(HID ? [['handover-vue', `openHandoverFull('${HID}')`], ['handover-edition', `editHandoverFields('${HID}', '${pid}')`]] : []),
    ['checklist-liste', `openChecklistFull('${pid}', 'installation', 'list')`],
    ['checklist-diaporama', `openChecklistFull('${pid}', 'installation', 'slide')`],
    ['whatsapp', `openWhatsAppImport('${pid}')`],
    ['demande-infos', `openInfoRequestModal('${pid}')`],
    ['planning-montage', opts.readOnly
      ? `(async () => { await loadAssemblyPlanCard('${pid}'); if (AP.plans[AP.phase]) openAssemblyPlanEditor(); })()`
      : `(async () => { await loadAssemblyPlanCard('${pid}'); if (AP.plans[AP.phase]) openAssemblyPlanEditor(); else await apCreate('template'); })()`],
  ];
  for (const [key, code] of flows) {
    await home();
    await page.evaluate(id => openProject(id), pid); await page.waitForTimeout(1000);
    try { await page.evaluate(code); } catch (e) { opts.onError?.(key, e); }
    await page.waitForTimeout(1800);
    await snap(key + '-haut');
    await page.evaluate(() => {
      document.querySelectorAll('.overlay.open, .overlay, .overlay .modal, .ap-ov, #checklist-full').forEach(e => { e.scrollTop = 1e6; });
    });
    await snap(key + '-bas');
  }
}
