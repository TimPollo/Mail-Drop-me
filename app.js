'use strict';

const $ = (id) => document.getElementById(id);
const ui = {
  pasteBtn: $('pasteBtn'),
  pasteTarget: $('pasteTarget'),
  pasteAssist: $('pasteAssist'),
  progressBox: $('progressBox'),
  progressText: $('progressText'),
  progressPercent: $('progressPercent'),
  progressBar: $('progressBar'),
  statusText: $('statusText'),
  emptyResult: $('emptyResult'),
  resultBox: $('resultBox'),
  emailField: $('emailField'),
  copyBtn: $('copyBtn'),
  resetBtn: $('resetBtn'),
  extraBox: $('extraBox'),
  extraList: $('extraList'),
  toast: $('toast')
};

let busy = false;
let toastTimer = null;

function setStatus(message, type = '') {
  ui.statusText.textContent = message;
  ui.statusText.className = `status-text ${type}`.trim();
}
function showToast(text) {
  clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2000);
}
function showProgress(message, value = 0) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  ui.progressBox.hidden = false;
  ui.progressText.textContent = message;
  ui.progressPercent.textContent = `${percent} %`;
  ui.progressBar.style.width = `${percent}%`;
}
function hideProgress() {
  ui.progressBox.hidden = true;
}
function resetApp(keepStatus = false) {
  ui.pasteTarget.innerHTML = '';
  ui.pasteAssist.hidden = true;
  ui.emailField.value = '';
  ui.resultBox.hidden = true;
  ui.emptyResult.hidden = false;
  ui.extraBox.hidden = true;
  ui.extraList.replaceChildren();
  ui.copyBtn.classList.remove('copied');
  ui.copyBtn.textContent = 'Kopieren';
  hideProgress();
  busy = false;
  if (!keepStatus) setStatus('Bereit. Kopiere ein Foto und tippe auf „Foto einsetzen“.');
}

function isEmail(value) {
  const email = String(value || '').trim();
  if (!email || email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  if (!/^[A-Za-z0-9._%+\-]+$/.test(parts[0])) return false;
  const labels = parts[1].split('.');
  return labels.length >= 2 && labels.slice(0, -1).every((part) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(part)) && /^[A-Za-z]{2,24}$/.test(labels.at(-1));
}

function findEmails(rawText) {
  const text = String(rawText || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/[|]/g, 'l');

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const found = [];
  const add = (value) => {
    const cleaned = value.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').replace(/\s+/g, '');
    if (isEmail(cleaned) && !found.some((entry) => entry.toLowerCase() === cleaned.toLowerCase())) found.push(cleaned);
  };

  const directMatches = text.match(/[A-Z0-9._%+\-]+@[A-Z0-9\-]+(?:\.[A-Z0-9\-]+)*\.[A-Z]{2,24}/gi) || [];
  directMatches.forEach(add);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const atIndex = line.indexOf('@');
    if (atIndex < 1) continue;

    const left = line.slice(0, atIndex).split(/[:：]/).pop().replace(/\s+/g, '').replace(/[^A-Za-z0-9._%+\-]/g, '');
    let right = line.slice(atIndex + 1).replace(/\s+/g, '').replace(/[^A-Za-z0-9.\-].*$/g, '');
    if (!left) continue;
    add(`${left}@${right}`);

    if (!/\.[A-Za-z]{2,24}$/.test(right)) {
      let carry = right;
      for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
        if (lines[j].includes('@')) break;
        const fragment = (lines[j].match(/^[^A-Za-z0-9]*([A-Za-z0-9][A-Za-z0-9.\-]*)/) || [])[1];
        if (!fragment) continue;
        carry += fragment;
        add(`${left}@${carry}`);
        if (/\.[A-Za-z]{2,24}$/.test(carry)) break;
      }
    }
  }

  return found;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length);
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}

function getImageFromItems(items) {
  for (const item of items) {
    const type = item.type || '';
    if (type.startsWith('image/')) return typeof item.getAsFile === 'function' ? item.getAsFile() : item;
  }
  return null;
}

async function preprocessBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const enhanced = gray < 150 ? Math.max(0, gray - 16) : Math.min(255, gray + 16);
    data[i] = enhanced;
    data[i + 1] = enhanced;
    data[i + 2] = enhanced;
  }
  ctx.putImageData(imageData, 0, 0);
  bitmap.close?.();
  return canvas;
}

function showEmails(emails) {
  const [first, ...rest] = emails;
  ui.emailField.value = first || '';
  ui.emptyResult.hidden = !!first;
  ui.resultBox.hidden = !first;
  ui.extraList.replaceChildren();

  if (rest.length) {
    ui.extraBox.hidden = false;
    for (const email of rest) {
      const row = document.createElement('div');
      row.className = 'extra-item';
      const code = document.createElement('code');
      code.textContent = email;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'extra-copy';
      button.textContent = 'Kopieren';
      button.addEventListener('click', async () => {
        await copyText(email);
        showToast('Zusätzliche E-Mail kopiert');
        setTimeout(() => resetApp(), 700);
      });
      row.append(code, button);
      ui.extraList.appendChild(row);
    }
  } else {
    ui.extraBox.hidden = true;
  }
}

async function recognizeImage(blob) {
  if (busy) return;
  busy = true;
  showProgress('Bild wird vorbereitet …', 5);
  setStatus('Foto erkannt. Texterkennung läuft …');

  try {
    const source = await preprocessBlob(blob);
    const result = await Tesseract.recognize(source, 'eng', {
      logger: (msg) => {
        if (msg.status) {
          const value = typeof msg.progress === 'number' ? msg.progress * 100 : 0;
          showProgress(msg.status, value);
        }
      }
    });

    const emails = findEmails(result?.data?.text || '');
    if (!emails.length) {
      resetApp(true);
      setStatus('Keine E-Mail gefunden. Kopiere das Foto erneut und versuche es noch einmal.', 'error');
      showToast('Keine E-Mail erkannt');
      return;
    }

    hideProgress();
    showEmails(emails);
    setStatus('E-Mail erkannt. Du kannst sie jetzt kopieren.', 'success');
    ui.emailField.focus();
    ui.emailField.setSelectionRange(0, ui.emailField.value.length);
  } catch (error) {
    console.error(error);
    resetApp(true);
    setStatus('Das Bild konnte nicht verarbeitet werden. Bitte erneut einfügen.', 'error');
    showToast('Bild konnte nicht gelesen werden');
  } finally {
    busy = false;
    ui.pasteTarget.innerHTML = '';
  }
}

async function tryReadClipboardDirectly() {
  if (!navigator.clipboard?.read) return false;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((entry) => entry.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      await recognizeImage(blob);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function beginPasteFlow() {
  if (busy) return;
  const directSuccess = await tryReadClipboardDirectly();
  if (directSuccess) return;

  ui.pasteAssist.hidden = false;
  ui.pasteTarget.focus();
  setStatus('Jetzt hier das Foto einsetzen: iPhone = lange drücken → Einsetzen. PC/Mac = Strg+V oder ⌘V.', 'success');
  showToast('Jetzt das kopierte Foto einsetzen');
}

ui.pasteBtn.addEventListener('click', beginPasteFlow);
ui.resetBtn.addEventListener('click', () => resetApp());
ui.copyBtn.addEventListener('click', async () => {
  const value = ui.emailField.value.trim();
  if (!value) {
    showToast('Keine E-Mail vorhanden');
    return;
  }
  try {
    await copyText(value);
    ui.copyBtn.classList.add('copied');
    ui.copyBtn.textContent = 'Kopiert';
    setStatus('E-Mail kopiert. App wird für das nächste Foto zurückgesetzt.', 'success');
    showToast('E-Mail kopiert');
    setTimeout(() => resetApp(), 800);
  } catch {
    setStatus('Kopieren fehlgeschlagen. Bitte versuche es erneut.', 'error');
    showToast('Kopieren fehlgeschlagen');
  }
});

document.addEventListener('paste', async (event) => {
  const items = Array.from(event.clipboardData?.items || []);
  const image = getImageFromItems(items);
  if (!image) return;
  event.preventDefault();
  ui.pasteTarget.innerHTML = '';
  await recognizeImage(image);
});

ui.pasteTarget.addEventListener('input', async () => {
  const embeddedImage = ui.pasteTarget.querySelector('img');
  if (embeddedImage?.src?.startsWith('data:image/')) {
    const response = await fetch(embeddedImage.src);
    const blob = await response.blob();
    ui.pasteTarget.innerHTML = '';
    await recognizeImage(blob);
    return;
  }

  const text = ui.pasteTarget.textContent.trim();
  if (text) {
    ui.pasteTarget.innerHTML = '';
    setStatus('Es wurde Text statt eines Fotos eingesetzt. Bitte ein kopiertes Bild einsetzen.', 'error');
  }
});

resetApp();
