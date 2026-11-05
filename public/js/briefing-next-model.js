/* Shared pure document operations, also exercised by node:test. */
(function(root) {
  'use strict';
  const copy = x => JSON.parse(JSON.stringify(x));
  const uid = () => 'bn-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const key = s => s.kind + ':' + s.id;
  const themes = { signature:{name:'Viewbox Signature',ink:'#000a3d',paper:'#f5f3ee',accent:'#647caa',font:'Arial'}, field:{name:'Field Clear',ink:'#152323',paper:'#ffffff',accent:'#146052',font:'Verdana'}, editorial:{name:'Project Editorial',ink:'#362b27',paper:'#faf4eb',accent:'#a16b43',font:'Georgia'} };
  function block(s) { return {id:uid(),kind:s.block,title:s.title,layout:'list',mode:'linked',source:{kind:s.kind,id:s.id},baseline:copy(s.fields),content:copy(s.fields),annotation:'',refreshedAt:new Date().toISOString()}; }
  function blank(projectId,title) { return {version:1,projectId,title:title || 'Briefing',theme:'signature',format:'wide',audience:'internal',updatedAt:new Date().toISOString(),excluded:[],pages:[{id:uid(),title:'Chantier en 60 secondes',blocks:[]}]}; }
  function migrate(b) {
    if (b.document) return copy(b.document);
    const d=blank(b.projectId,b.title);
    const slides=b.studioSlides?.slides?.length ? b.studioSlides.slides : b.slides;
    if (Array.isArray(slides) && slides.length) d.pages=slides.map((s,i)=>({id:uid(),title:s.name||s.title||'Page '+(i+1),blocks:[{id:uid(),kind:'legacy',title:s.name||s.title||'Original',layout:'list',mode:'frozen',baseline:{},content:{index:String(i),mode:b.studioSlides?.slides?.length?'studio':'classic'},annotation:''}]}));
    return d;
  }
  function filter(s,o={}) {
    if (s.kind==='task') {
      if (o.open && ['done','cancelled'].includes(s.fields.status)) return false;
      if (o.priority && s.fields.priority!==o.priority) return false;
      if (o.responsible && s.fields.assignedToId!==o.responsible) return false;
      if (o.date && !s.fields.date.startsWith(o.date)) return false;
    }
    if (s.kind==='checklist') {
      if (o.open && ['ok','na'].includes(s.fields.status)) return false;
      if (o.phase && s.fields.phase!==o.phase) return false;
      if (o.category && s.fields.category!==o.category) return false;
    }
    if (s.kind==='team' && o.phase && !['both',o.phase].includes(s.fields.phase)) return false;
    return true;
  }
  function generate(projectId,title,sources,options={}) {
    const d=blank(projectId,title); d.theme=options.theme||'signature'; d.format=options.format||'wide';
    const labels={project:'Chantier en 60 secondes',task:'Actions opérationnelles',checklist:'Contrôles qualité',truck:'Livraisons',contact:'Contacts',team:'Équipe',file:'Plans et médias'};
    d.pages=[];
    for(const kind of Object.keys(labels)) {
      const list=sources.filter(s=>s.kind===kind && filter(s,options) && (!options.selected || options.selected.includes(key(s))));
      if(list.length) d.pages.push({id:uid(),title:labels[kind],blocks:list.map(block)});
    }
    if(!d.pages.length) d.pages=blank(projectId,title).pages;
    d.excluded=sources.filter(s=>!d.pages.some(p=>p.blocks.some(b=>b.source&&key(b.source)===key(s)))).map(key);
    return d;
  }
  // Three-way merge per field. Deletions are explicit proposals; annotations/style never touched.
  function diff(d,sources) {
    const changes=[], map=new Map(sources.map(s=>[key(s),s])), seen=new Set(d.excluded);
    for(const p of d.pages) for(const b of p.blocks) if(b.source) {
      const k=key(b.source); seen.add(k); if(b.mode==='frozen') continue;
      const s=map.get(k);
      if(!s) {changes.push({type:'deleted',blockId:b.id,label:b.title});continue;}
      for(const f of new Set([...Object.keys(b.baseline),...Object.keys(s.fields)])) {
        const before=b.baseline[f]||'', remote=s.fields[f]||'', local=b.content[f]||'';
        if(before!==remote) changes.push({type:local!==before&&local!==remote?'conflict':'modified',blockId:b.id,field:f,before,local,remote,label:b.title});
      }
    }
    for(const s of sources) if(!seen.has(key(s))) changes.push({type:'added',source:s,label:s.title});
    return changes;
  }
  function apply(d,changes,choices) {
    const out=copy(d);
    changes.forEach((c,i)=>{
      const choice=choices[i]||'keep';
      if(c.type==='added') {if(choice==='remote') out.pages[out.pages.length-1].blocks.push(block(c.source)); else out.excluded.push(key(c.source));return;}
      const b=out.pages.flatMap(p=>p.blocks).find(b=>b.id===c.blockId); if(!b)return;
      if(c.type==='deleted') {if(choice==='remote') {out.excluded.push(key(b.source));out.pages.forEach(p=>p.blocks=p.blocks.filter(x=>x.id!==b.id));} else b.mode='frozen';return;}
      b.baseline[c.field]=c.remote; if(choice==='remote') b.content[c.field]=c.remote; else b.mode='custom';
      b.refreshedAt=new Date().toISOString();
    }); return out;
  }
  function duplicate(value) {const x=copy(value);x.id=uid();if(x.blocks)x.blocks=x.blocks.map(duplicate);return x;}
  const api={copy,uid,key,themes,blank,migrate,filter,generate,diff,apply,duplicate,block};
  if(typeof module!=='undefined')module.exports=api; else root.BriefingNextModel=api;
})(globalThis);
