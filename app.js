/* MailSnap: Browser-only OCR. Bilddaten werden nicht an einen eigenen Server gesendet. */
'use strict';

const $ = (id) => document.getElementById(id);
const ui = {
  dropzone: $('dropzone'), fileInput: $('fileInput'), emptyState: $('emptyState'),
  preview: $('preview'), previewImage: $('previewImage'), cropLayer: $('cropLayer'), cropRect: $('cropRect'),
  pasteBtn: $('pasteBtn'), chooseBtn: $('chooseBtn'), pasteTarget: $('pasteTarget'),
  cropBtn: $('cropBtn'), retryBtn: $('retryBtn'), cropHelp: $('cropHelp'),
  progressBox: $('progressBox'), progressText: $('progressText'), progressPercent: $('progressPercent'), progressBar: $('progressBar'),
  statusText: $('statusText'), results: $('results'), noResult: $('noResult'), resultCount: $('resultCount'), reviewHint: $('reviewHint'), toast: $('toast')
};

let sourceImage = null;
let currentURL = null;
let selection = null; // normalized: {x, y, w, h}, relativ zum sichtbaren Bild
let cropActive = false;
let dragStart = null;
let workerPromise = null;
let recognitionInProgress = false;
let pendingRecognition = false;
let imageVersion = 0;
let toastTimer = null;

function setStatus(message, type = '') {
  ui.statusText.textContent = message;
  ui.statusText.className = `status-text ${type}`.trim();
}
function showProgress(message = 'Text wird erkannt …', percentage = 0) {
  ui.progressBox.hidden = false;
  ui.progressText.textContent = message;
  const value = Math.round(Math.max(0, Math.min(100, percentage)));
  ui.progressPercent.textContent = `${value} %`;
  ui.progressBar.style.width = `${value}%`;
}
function hideProgress() { ui.progressBox.hidden = true; }
function showToast(text) {
  clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2300);
}

/* Findet normale Adressen und setzt OCR-Zeilenumbrüche wie „@mi / mimail.me“ zusammen. */
function findEmails(rawText) {
  const text = String(rawText || '').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const found = [];
  const add = (email) => {
    const cleaned = email.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (isEmail(cleaned) && !found.some((x) => x.toLowerCase() === cleaned.toLowerCase())) found.push(cleaned);
  };
  const emailRe = /[A-Z0-9._%+\-]+@[A-Z0-9\-]+(?:\.[A-Z0-9\-]+)*\.[A-Z]{2,24}/gi;
  for (const hit of text.matchAll(emailRe)) add(hit[0]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const at = line.indexOf('@');
    if (at < 1) continue;

    let prefix = line.slice(0, at);
    // Bei „E-Mail: name@...“ nur den Teil nach dem Doppelpunkt verwenden.
    prefix = prefix.split(/[:：]/).pop().trim();
    // OCR fügt manchmal mitten im Benutzernamen ein Leerzeichen ein.
    const localPart = prefix.replace(/\s+/g, '').replace(/[^A-Za-z0-9._%+\-]/g, '');
    let domainPart = line.slice(at + 1).trim().replace(/[\s]/g, '').replace(/[^A-Za-z0-9.\-].*$/g, '');
    if (!localPart) continue;
    add(`${localPart}@${domainPart}`);

    // Ist die Domain unvollständig, hängt sie häufig in der nächsten Zeile.
    if (!/\.[A-Za-z]{2,24}$/.test(domainPart)) {
      let consumed = 0;
      for (let j = i + 1; j < lines.length && consumed < 2; j++) {
        const nextLine = lines[j];
        if (nextLine.includes('@')) break;
        const fragment = (nextLine.match(/^[^A-Za-z0-9]*([A-Za-z0-9][A-Za-z0-9.\-]*)/) || [])[1];
        if (!fragment) continue;
        domainPart += fragment;
        consumed++;
        if (/\.[A-Za-z]{2,24}$/.test(domainPart)) {
          add(`${localPart}@${domainPart}`);
          break;
        }
      }
    }
  }
  return found;
}
function isEmail(value) {
  if (value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64) return false;
  if (!/^[A-Za-z0-9._%+\-]+$/.test(parts[0])) return false;
  if (parts[0].startsWith('.') || parts[0].endsWith('..')) return false;
  const labels = parts[1].split('.');
  return labels.length >= 2 && labels.slice(0, -1).every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part)) && /^[A-Za-z]{2,24}$/.test(labels.at(-1));
}

function clearResults() {
  ui.results.replaceChildren();
  ui.resultCount.hidden = true;
  ui.reviewHint.hidden = true;
  const empty = document.createElement('div');
  empty.className = 'no-result';
  empty.innerHTML = '<span class="no-result-glyph">@</span><span>Nach dem Einfügen erscheint die E-Mail hier oben.</span>';
  ui.results.appendChild(empty);
}
function showResults(emails) {
  ui.results.replaceChildren();
  ui.resultCount.hidden = false;
  ui.resultCount.textContent = `${emails.length} gefunden`;
  ui.reviewHint.hidden = false;

  for (const email of emails) {
    const row = document.createElement('div');
    row.className = 'email-row';
    const field = document.createElement('input');
    field.className = 'email-input';
    field.value = email;
    field.type = 'text'; // type=text verhindert unerwünschte Auto-Korrekturen bei OCR
    field.autocomplete = 'off';
    field.autocapitalize = 'off';
    field.spellcheck = false;
    field.setAttribute('aria-label', 'Erkannte E-Mail-Adresse – bei Bedarf bearbeiten');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg><span>Kopieren</span>';
    button.addEventListener('click', async () => {
      const value = field.value.trim();
      if (!value) { showToast('Keine E-Mail eingetragen.'); return; }
      try {
        await copyText(value);
        button.classList.add('copied');
        button.querySelector('span').textContent = 'Kopiert!';
        showToast('E-Mail in die Zwischenablage kopiert ✓');
        setTimeout(() => { button.classList.remove('copied'); button.querySelector('span').textContent = 'Kopieren'; }, 1700);
      } catch { showToast('Kopieren fehlgeschlagen – bitte Adresse markieren.'); }
    });
    row.append(field, button);
    ui.results.appendChild(row);
  }
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* Fallback */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(textarea);
  textarea.focus(); textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw Error('Clipboard permission denied');
}

function getImageFile(items) {
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      return typeof item.getAsFile === 'function' ? item.getAsFile() : item;
    }
  }
  return null;
}
function loadImage(file) {
  if (!file || !file.type?.startsWith('image/')) { setStatus('Bitte eine Bilddatei (PNG, JPG oder WEBP) verwenden.', 'error'); return; }
  const newURL = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (currentURL) URL.revokeObjectURL(currentURL);
    currentURL = newURL;
    sourceImage = image;
    imageVersion++;
    selection = null;
    toggleCrop(false);
    ui.previewImage.src = newURL;
    ui.emptyState.hidden = true;
    ui.preview.hidden = false;
    ui.dropzone.classList.add('has-image');
    ui.cropBtn.disabled = false;
    ui.retryBtn.disabled = false;
    ui.pasteTarget.replaceChildren();
    clearResults();
    setStatus('Bild geladen. Die Adresse wird automatisch erkannt …');
    recognize();
  };
  image.onerror = () => { URL.revokeObjectURL(newURL); setStatus('Dieses Bild konnte nicht geöffnet werden.', 'error'); };
  image.src = newURL;
}

function openFilePicker() { ui.fileInput.click(); }
ui.chooseBtn.addEventListener('click', openFilePicker);
ui.fileInput.addEventListener('change', () => { if (ui.fileInput.files?.[0]) loadImage(ui.fileInput.files[0]); ui.fileInput.value = ''; });
ui.dropzone.addEventListener('click', () => { if (!sourceImage) openFilePicker(); });
ui.dropzone.addEventListener('keydown', (event) => {
  if (event.target === ui.dropzone && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openFilePicker(); }
});
for (const type of ['dragenter', 'dragover']) ui.dropzone.addEventListener(type, (event) => { event.preventDefault(); ui.dropzone.classList.add('dragover'); });
for (const type of ['dragleave', 'drop']) ui.dropzone.addEventListener(type, (event) => { event.preventDefault(); ui.dropzone.classList.remove('dragover'); });
ui.dropzone.addEventListener('drop', (event) => {
  const file = getImageFile(Array.from(event.dataTransfer.files));
  if (file) loadImage(file);
  else setStatus('Im abgelegten Inhalt wurde kein Bild gefunden.', 'error');
});

// Klassisches Strg+V / Cmd+V sowie iPhone „Einsetzen“ im editierbaren Feld.
document.addEventListener('paste', (event) => {
  const items = Array.from(event.clipboardData?.items || []);
  const imageFile = getImageFile(items);
  if (imageFile) {
    event.preventDefault();
    loadImage(imageFile);
    ui.pasteTarget.blur();
  }
});
ui.pasteTarget.addEventListener('input', () => {
  const embeddedImage = ui.pasteTarget.querySelector('img');
  if (embeddedImage?.src?.startsWith('data:image/')) {
    fetch(embeddedImage.src).then((response) => response.blob()).then(loadImage).catch(() => setStatus('Bild aus Zwischenablage konnte nicht gelesen werden.', 'error'));
  } else if (ui.pasteTarget.textContent.trim()) {
    ui.pasteTarget.textContent = '';
    setStatus('Es wurde Text statt eines Bilds eingefügt. Bitte das Screenshot-Bild kopieren.', 'error');
  }
});
ui.pasteBtn.addEventListener('click', async () => {
  if (!navigator.clipboard?.read) {
    ui.pasteTarget.focus();
    setStatus('Tippe im Feld auf „Einsetzen“ oder verwende „Bild auswählen“.', '');
    showToast('Im Feld lange drücken → Einsetzen');
    return;
  }
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) { loadImage(await item.getType(type)); return; }
    }
    setStatus('In der Zwischenablage wurde kein Bild gefunden. Kopiere zuerst einen Screenshot.', 'error');
  } catch {
    ui.pasteTarget.focus();
    setStatus('Direktes Einfügen wurde blockiert. Im Feld lange drücken und „Einsetzen“ auswählen.', '');
    showToast('Alternativ: Bild auswählen');
  }
});

function toggleCrop(enabled) {
  cropActive = enabled;
  ui.preview.classList.toggle('crop-active', enabled);
  ui.cropBtn.classList.toggle('active', enabled);
  ui.cropBtn.querySelector('span').textContent = enabled ? 'Auswahl abbrechen' : 'Bereich markieren';
  ui.cropHelp.hidden = !enabled;
  if (enabled) ui.cropBtn.setAttribute('aria-pressed', 'true');
  else ui.cropBtn.setAttribute('aria-pressed', 'false');
}
ui.cropBtn.addEventListener('click', () => {
  if (!sourceImage) return;
  toggleCrop(!cropActive);
  if (cropActive) { selection = null; ui.cropRect.hidden = true; }
});
ui.retryBtn.addEventListener('click', () => { if (sourceImage) recognize(); });

function relativePointer(event) {
  const rect = ui.previewImage.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  };
}
function drawSelection(region) {
  ui.cropRect.hidden = false;
  ui.cropRect.style.left = `${region.x * 100}%`;
  ui.cropRect.style.top = `${region.y * 100}%`;
  ui.cropRect.style.width = `${region.w * 100}%`;
  ui.cropRect.style.height = `${region.h * 100}%`;
}
ui.cropLayer.addEventListener('pointerdown', (event) => {
  if (!cropActive) return;
  event.preventDefault(); event.stopPropagation();
  dragStart = relativePointer(event);
  ui.cropLayer.setPointerCapture(event.pointerId);
  drawSelection({x:dragStart.x,y:dragStart.y,w:0,h:0});
});
ui.cropLayer.addEventListener('pointermove', (event) => {
  if (!cropActive || !dragStart) return;
  const end = relativePointer(event);
  drawSelection({x:Math.min(dragStart.x,end.x),y:Math.min(dragStart.y,end.y),w:Math.abs(dragStart.x-end.x),h:Math.abs(dragStart.y-end.y)});
});
ui.cropLayer.addEventListener('pointerup', (event) => {
  if (!cropActive || !dragStart) return;
  event.preventDefault(); event.stopPropagation();
  const end = relativePointer(event);
  selection = {x:Math.min(dragStart.x,end.x),y:Math.min(dragStart.y,end.y),w:Math.abs(dragStart.x-end.x),h:Math.abs(dragStart.y-end.y)};
  dragStart = null;
  if (selection.w < .035 || selection.h < .015) {
    selection = null; ui.cropRect.hidden = true;
    setStatus('Bitte einen etwas größeren Bereich markieren.');
    return;
  }
  toggleCrop(false);
  ui.cropRect.hidden = true;
  recognize();
});
ui.cropLayer.addEventListener('pointercancel', () => { dragStart = null; });

function makeOCRCanvas() {
  const img = sourceImage;
  if (!img) return null;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (selection) {
    sx = Math.floor(selection.x * sw);
    sy = Math.floor(selection.y * sh);
    sw = Math.max(1, Math.round(selection.w * sw));
    sh = Math.max(1, Math.round(selection.h * sh));
  }
  const desiredScale = selection ? 2.6 : 1.5;
  const scale = Math.min(desiredScale, 3200 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', {willReadFrequently: false});
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Originalfarben erhalten: auf dem Beispielbild erkennt OCR so mehr Zeichen korrekt.
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  return canvas;
}

async function getWorker() {
  if (workerPromise) return workerPromise;
  if (!window.Tesseract?.createWorker) throw Error('Tesseract.js ist nicht geladen.');
  workerPromise = Tesseract.createWorker('eng', 1, {
    logger: (event) => {
      if (!recognitionInProgress) return;
      if (event.status === 'recognizing text') showProgress('Adresse wird gelesen …', 20 + (event.progress || 0) * 78);
      else if (event.status?.includes('loading') || event.status?.includes('initializing')) showProgress('Texterkennung wird geladen …', 5 + (event.progress || 0) * 15);
    }
  }).catch((error) => { workerPromise = null; throw error; });
  return workerPromise;
}
async function recognize() {
  if (!sourceImage) return;
  if (recognitionInProgress) { pendingRecognition = true; return; }
  recognitionInProgress = true;
  const currentImageVersion = imageVersion;
  pendingRecognition = false;
  ui.retryBtn.disabled = true;
  showProgress('Texterkennung wird gestartet …', 2);
  setStatus('Das Bild wird direkt im Browser analysiert …');
  try {
    const worker = await getWorker();
    showProgress('Adresse wird gelesen …', 18);
    const canvas = makeOCRCanvas();
    const result = await worker.recognize(canvas);
    const emails = findEmails(result.data.text);
    if (imageVersion !== currentImageVersion) return; // älteres Bild wurde während OCR ersetzt
    hideProgress();
    if (emails.length) {
      showResults(emails);
      setStatus(emails.length === 1 ? 'E-Mail erkannt. Jetzt einfach auf „Kopieren“ tippen.' : `${emails.length} E-Mail-Adressen erkannt.`, 'success');
    } else {
      clearResults();
      setStatus('Keine vollständige E-Mail erkannt. Versuche „Bereich markieren“ und ziehe einen Rahmen nur um die Adresse.', 'error');
    }
  } catch (error) {
    hideProgress();
    setStatus('Texterkennung konnte nicht geladen werden. Prüfe deine Internetverbindung und versuche es erneut.', 'error');
    console.error('OCR error:', error);
  } finally {
    recognitionInProgress = false;
    ui.retryBtn.disabled = !sourceImage;
    if (pendingRecognition) { pendingRecognition = false; recognize(); }
  }
}
