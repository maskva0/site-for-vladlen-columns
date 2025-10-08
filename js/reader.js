// js/reader.js — версия с pdf.js и «свэгом»
// Требует файлов: /lib/pdfjs/pdf.mjs и /lib/pdfjs/pdf.worker.mjs
// И чтобы в reader.html скрипт был подключён так: <script type="module" src="js/reader.js"></script>

import * as pdfjsLib from '../lib/pdfjs/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdfjs/pdf.worker.mjs';

const $ = (s, r=document) => r.querySelector(s);
const params = new URLSearchParams(location.search);
const src   = params.get('src');
const typeParam = (params.get('type')||'auto').toLowerCase();
const title = params.get('title');

// Элементы UI
const elTitle = $('#bookTitle');
const openRaw = $('#openRaw');
const textBox = $('#textContainer');
const pdfWrap = $('#pdfContainer');
const pdfCanvas = $('#pdfCanvas');
const ctx = pdfCanvas ? pdfCanvas.getContext('2d') : null;

const pageInfo = $('#pageInfo');
const btnPrev  = $('#prev');
const btnNext  = $('#next');
const btnFitW  = $('#fitWidth');
const btnFitP  = $('#fitPage');
const btnSmaller = $('#smaller');
const btnBigger  = $('#bigger');
const btnTheme   = $('#theme');
const btnNight   = $('#night');

// Prefs
const PREF_KEY = 'readerPrefs:v3';
const prefs = (()=>{ try { return JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); } catch{ return {}; } })();
if(prefs.theme) document.body.className = prefs.theme; else document.body.classList.add('theme-light');
if(prefs.fs) document.documentElement.style.setProperty('--fs', prefs.fs);

let mode = 'text'; // 'text' | 'pdf'
let pdfDoc = null, pageNum = 1, scale = prefs.scale || 1, fit = prefs.fit || 'width';
let pdfNight = prefs.pdfNight ?? true; // ночной режим для PDF (инверсия) по умолчанию ВКЛ

function save(){
  try{
    localStorage.setItem(PREF_KEY, JSON.stringify({
      theme: document.body.className,
      fs: getComputedStyle(document.documentElement).getPropertyValue('--fs').trim(),
      scale, fit, pageNum, pdfNight
    }));
  }catch{}
}

function setTitle(){
  if(title){ document.title = `${title} — Читалка`; elTitle.textContent = title; }
}
function setRawLink(){
  if(src){ openRaw.href = src; } else { openRaw?.remove(); }
}

function detectType(){
  if(typeParam !== 'auto') return typeParam;
  if(!src) return 'txt';
  if(/\.pdf(\?|$)/i.test(src)) return 'pdf';
  if(/\.html?(\?|$)/i.test(src)) return 'html';
  return 'txt';
}

function updatePageInfo(){ pageInfo && (pageInfo.textContent = `${pageNum} / ${pdfDoc?pdfDoc.numPages:1}`); }

async function openPdf(){
  const task = pdfjsLib.getDocument(src);
  pdfDoc = await task.promise;
  pageNum = Math.min(Math.max(1, prefs.pageNum||1), pdfDoc.numPages);
  mode = 'pdf';
  textBox.hidden = true; pdfWrap.hidden = false;
  pdfWrap.classList.toggle('night', !!pdfNight);
  await renderPage(true);
}

async function renderPage(forceFit=false){
  const page = await pdfDoc.getPage(pageNum);
  const vw = page.getViewport({ scale: 1 });
  const box = pdfWrap.getBoundingClientRect();

  if(forceFit || fit === 'width'){
    scale = (box.width - 24) / vw.width; fit = 'width';
  } else if(fit === 'page'){
    scale = Math.min((box.width - 24)/vw.width, (box.height - 24)/vw.height); // вся страница
  }
  scale = Math.max(0.6, Math.min(4, scale));

  const vp = page.getViewport({ scale });
  pdfCanvas.width  = Math.floor(vp.width);
  pdfCanvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  updatePageInfo();
  save();
}

function zoom(delta){ fit = null; scale = Math.max(0.6, Math.min(4, scale + delta)); renderPage(); }
function go(n){ pageNum = Math.min(Math.max(1, pageNum + n), pdfDoc.numPages); renderPage(); }

async function load(){
  if(!src){ elTitle.textContent = 'Файл не указан'; return; }
  const t = detectType();
  if(t === 'pdf'){
    try{ await openPdf(); return; }
    catch(err){
      textBox.hidden = false; pdfWrap.hidden = true; textBox.classList.toggle('night', pdfNight);
      textBox.innerHTML = `<p>Ошибка PDF: ${err.message}</p>`;
      return;
    }
  }
  // TEXT/HTML
  mode = 'text';
  try{
    const res = await fetch(src);
    if(!res.ok) throw new Error('Не удалось загрузить файл');
    const isHtml = (t === 'html');
    const data = await res.text();
    textBox.hidden = false; pdfWrap.hidden = true;
    textBox[ isHtml ? 'innerHTML' : 'textContent' ] = data;
  }catch(err){
    textBox.hidden = false; pdfWrap.hidden = true;
    textBox.innerHTML = `<p>Ошибка загрузки: ${err.message}</p>`;
  }
}

// ==== UI bindings ====
btnPrev?.addEventListener('click', ()=>{ if(mode==='pdf' && pdfDoc) go(-1); });
btnNext?.addEventListener('click', ()=>{ if(mode==='pdf' && pdfDoc) go(+1); });
btnFitW?.addEventListener('click', ()=>{ if(mode==='pdf' && pdfDoc){ fit='width'; renderPage(true); } });
btnFitP?.addEventListener('click', ()=>{ if(mode==='pdf' && pdfDoc){ fit='page'; renderPage(true); } });

btnSmaller?.addEventListener('click', ()=>{
  if(mode === 'pdf' && pdfDoc) zoom(-0.1);
  else{
    const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||18;
    document.documentElement.style.setProperty('--fs', Math.max(14, fs-2)+'px');
    save();
  }
});
btnBigger?.addEventListener('click', ()=>{
  if(mode === 'pdf' && pdfDoc) zoom(+0.1);
  else{
    const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||18;
    document.documentElement.style.setProperty('--fs', Math.min(28, fs+2)+'px');
    save();
  }
});

btnTheme?.addEventListener('click', ()=>{
  document.body.classList.toggle('theme-dark');
  document.body.classList.toggle('theme-light');
  save();
});
btnNight?.addEventListener('click', ()=>{
  pdfNight = !pdfNight;
  pdfWrap.classList.toggle('night', pdfNight);
  textBox.classList.toggle('night', pdfNight); // инвертировать текстовый режим тоже
  save();
}); save();


// Клава
addEventListener('keydown', (e)=>{
  if((e.key||'').toLowerCase()==='t') btnTheme?.click();
  if((e.key||'').toLowerCase()==='n') btnNight?.click();
  if(e.key==='+') btnBigger?.click();
  if(e.key==='-'||e.key==='_') btnSmaller?.click();
  if(mode==='pdf' && pdfDoc){
    if(e.key==='ArrowLeft')  btnPrev?.click();
    if(e.key==='ArrowRight') btnNext?.click();
    if((e.key||'').toLowerCase()==='w') btnFitW?.click();
    if((e.key||'').toLowerCase()==='p') btnFitP?.click();
  }
});

// Респонсив
addEventListener('resize', ()=>{ if(mode==='pdf' && (fit==='width'||fit==='page')) renderPage(true); });

setTitle(); setRawLink(); load();
