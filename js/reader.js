 (function(){
  const $ = (s, r=document) => r.querySelector(s);

  // UI
  const elTitle = $('#bookTitle');
  const pageInfo = $('#pageInfo');
  const openRaw  = $('#openRaw');
  const viewport = $('.viewport');
  const spread   = $('#spread');
  const left     = $('#pageLeft');
  const right    = $('#pageRight');
  const ctxL     = left.getContext('2d');
  const ctxR     = right.getContext('2d');

  const btnPrev  = $('#prev');
  const btnNext  = $('#next');
  const btnZoomIn  = $('#zoomIn');
  const btnZoomOut = $('#zoomOut');
  const btnBmT   = $('#bookmarkToggle');
  const btnBmL   = $('#bookmarkListBtn');
  const btnBmX   = $('#bookmarkClose');
  const btnBmClr = $('#bookmarkClear');
  const bmPanel  = $('#bookmarkPanel');
  const bmList   = $('#bookmarkList');

  // Тёплая тема
  const themeBtn = $('#themeToggle');
  const THEME_KEY = 'reader:theme';
  function applyTheme(name){
    document.body.classList.toggle('theme-warm', name === 'warm');
    if(themeBtn) themeBtn.textContent = (name === 'warm') ? 'Чистый' : 'Тёплый';
  }
  let theme = localStorage.getItem(THEME_KEY) || 'warm';
  applyTheme(theme);
  themeBtn?.addEventListener('click', ()=>{
    theme = (theme === 'warm') ? 'light' : 'warm';
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });

  // URL params
  const params = new URLSearchParams(location.search);
  const SRC   = params.get('src');
  const TITLE = params.get('title') || '';

  function toast(msg){
    console.error(msg);
    const box = document.createElement('div');
    box.textContent = msg;
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;background:#ffeaea;color:#7b1f1f;border:1px solid #f4bcbc;padding:.6rem .8rem;border-radius:10px;box-shadow:0 10px 30px #0003;z-index:9999';
    document.body.appendChild(box);
    setTimeout(()=>box.remove(), 4500);
  }

  if(!window.pdfjsLib){ toast('pdf.js не загружен (см. скрипты внизу reader.html)'); return; }
  if(!SRC){ toast('В URL не передан ?src=путь/к/файлу.pdf'); return; }

  const pdfjs = window.pdfjsLib;

  // Состояние: левая страница (нечётная), масштаб и режим подгонки
  const baseKey = encodeURIComponent(SRC);
  const KEY = (name) => `reader:spread:v4:${name}:${baseKey}`;
  const state = { page: 1, scale: 1, mode: 'fit', bookmarks: [] }; // mode: 'fit' | 'zoom'

  function loadState(){ try{ Object.assign(state, JSON.parse(localStorage.getItem(KEY('state'))||'{}')); }catch{} }
  function saveState(){ try{ localStorage.setItem(KEY('state'), JSON.stringify(state)); }catch{} }

  // Закладки
  function hasBm(p){ return state.bookmarks.some(b=>b.page===p); }
  function toggleBm(p){ if(hasBm(p)) state.bookmarks = state.bookmarks.filter(b=>b.page!==p); else state.bookmarks.push({page:p, t:Date.now()}); saveState(); renderBmBtn(); renderBmList(); }
  function renderBmBtn(){ btnBmT.textContent = hasBm(currentMarkPage()) ? '★' : '☆'; }
  function renderBmList(){
    bmList.innerHTML='';
    const arr = [...state.bookmarks].sort((a,b)=>a.page-b.page);
    if(!arr.length){ const li=document.createElement('li'); li.innerHTML='<span class="meta">Закладок пока нет</span>'; li.style.cursor='default'; bmList.appendChild(li); return; }
    for(const b of arr){
      const li=document.createElement('li');
      const info=document.createElement('div'); info.innerHTML = `<strong>Стр. ${b.page}</strong><div class="meta">${new Date(b.t).toLocaleString()}</div>`;
      const del=document.createElement('button'); del.className='btn btn-ghost'; del.textContent='Удалить'; del.addEventListener('click',(e)=>{ e.stopPropagation(); state.bookmarks=state.bookmarks.filter(x=>x.page!==b.page); saveState(); renderBmBtn(); renderBmList(); });
      li.appendChild(info); li.appendChild(del); li.addEventListener('click',()=>{ jumpTo(b.page); bmPanel.hidden=true; });
      bmList.appendChild(li);
    }
  }

  // Заголовки/инфо
  function updateTitle(){ if(TITLE){ document.title = `${TITLE} — Читалка`; elTitle.textContent = TITLE; } }
  function updateRaw(){ openRaw.href = SRC; }
  function leftPageNum(){ return state.page % 2 === 1 ? state.page : Math.max(1, state.page-1); }
  function currentMarkPage(){ const l=leftPageNum(); const r=Math.min(l+1, pdfDoc?.numPages||l); return r>l?r:l; }
  function updatePageInfo(){ if(!pdfDoc) return; const l=leftPageNum(), r=Math.min(l+1, pdfDoc.numPages); pageInfo.textContent = `${l}–${r} / ${pdfDoc.numPages}`; }

  // PDF
  let pdfDoc = null;

  async function openPdf(){
    try{ pdfDoc = await pdfjs.getDocument(SRC).promise; }
    catch(err){ toast('Не удалось открыть PDF. Проверь путь src. '+(err?.message||err)); return; }
    state.page = Math.min(Math.max(1, state.page||1), pdfDoc.numPages);
    if(state.page % 2 === 0) state.page -= 1; // левая всегда нечётная
    renderBmBtn(); renderBmList();
    await render(true);
  }

  function availableBox(){ return spread.getBoundingClientRect(); }

  function computeFitScale(pageViewport){
    const box = availableBox();
    const PAD_LR = 24; // 12 + 12 из CSS
    const availW = box.width  - PAD_LR; // под две страницы
    const availH = box.height - 20;
    const scaleByH = availH / pageViewport.height;
    const scaleByW = (availW / 2) / pageViewport.width;
    return Math.max(0.2, Math.min(6, Math.min(scaleByH, scaleByW)));
  }

  async function render(forceFit=false){
    if(!pdfDoc) return;
    updatePageInfo();

    const l = leftPageNum();
    const r = Math.min(l+1, pdfDoc.numPages);

    const pageL = await pdfDoc.getPage(l);
    const vw1   = pageL.getViewport({ scale: 1 });

    // масштаб: если режим fit или forceFit
    if(state.mode === 'fit' || forceFit){
      state.scale = computeFitScale(vw1);
    } else {
      // убедимся, что не совсем крошечный/огромный
      const fitScale = computeFitScale(vw1);
      state.scale = Math.max(0.2, Math.min(6, state.scale||fitScale));
    }

    // левая
    const vpL = pageL.getViewport({ scale: state.scale });
    left.width  = Math.floor(vpL.width);
    left.height = Math.floor(vpL.height);
    await pageL.render({ canvasContext: ctxL, viewport: vpL }).promise;

    // правая
    if(r > l){
      const pageR = await pdfDoc.getPage(r);
      const vpR = pageR.getViewport({ scale: state.scale });
      right.width  = Math.floor(vpR.width);
      right.height = Math.floor(vpR.height);
      await pageR.render({ canvasContext: ctxR, viewport: vpR }).promise;
    } else {
      right.width = left.width; right.height = left.height;
      const paper = getComputedStyle(document.body).getPropertyValue('--paper').trim() || '#fff';
      ctxR.fillStyle = paper; ctxR.fillRect(0,0,right.width,right.height);
    }
  }

  // Навигация разворотами
  function go(delta){
    if(!pdfDoc) return;
    let l = leftPageNum() + 2*delta;
    l = Math.min(Math.max(1, l), pdfDoc.numPages);
    if(l % 2 === 0) l -= 1;
    state.page = l; saveState(); render();
  }
  function jumpTo(p){ let l=Math.min(Math.max(1,p), pdfDoc.numPages); if(l%2===0) l-=1; state.page=l; saveState(); render(true); }

  // ZOOM
  function zoom(delta){
    state.mode = 'zoom';
    const base = state.scale || 1;
    state.scale = Math.max(0.2, Math.min(6, base + delta));
    saveState();
    render(false);
  }
  function zoomIn(){ zoom(+0.15); }
  function zoomOut(){ zoom(-0.15); }

  function bind(){
    btnPrev.addEventListener('click', ()=>go(-1));
    btnNext.addEventListener('click', ()=>go(+1));

    btnZoomIn.addEventListener('click', zoomIn);
    btnZoomOut.addEventListener('click', zoomOut);

    btnBmT.addEventListener('click', ()=> toggleBm(currentMarkPage()));
    btnBmL.addEventListener('click', ()=>{ bmPanel.hidden = !bmPanel.hidden; });
    btnBmX.addEventListener('click', ()=>{ bmPanel.hidden = true; });
    btnBmClr.addEventListener('click', ()=>{ if(confirm('Удалить все закладки для этой книги?')){ state.bookmarks=[]; saveState(); renderBmBtn(); renderBmList(); } });

    addEventListener('keydown', (e)=>{
      const k=(e.key||'').toLowerCase();
      if(e.key==='ArrowLeft')  return btnPrev.click();
      if(e.key==='ArrowRight') return btnNext.click();
      if(k==='+' || e.key==='=') return btnZoomIn.click();
      if(k==='-' || e.key==='_') return btnZoomOut.click();
      if(k==='m') return btnBmT.click();
      if(k==='l'){ bmPanel.hidden = !bmPanel.hidden; return; }
      if(k==='t' && themeBtn) return themeBtn.click();
    });

    addEventListener('resize', ()=> render(state.mode === 'fit'));
  }

  // init
  (function init(){ updateTitle(); updateRaw(); loadState(); bind(); openPdf(); })();
})();
