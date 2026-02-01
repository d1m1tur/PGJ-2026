const envLabelEl = document.querySelector('#envLabel');
const qrImageEl = document.querySelector('#qrImage');
const gameUrlEl = document.querySelector('#gameUrl');

const gameUrl = new URL('/game/', window.location.origin).toString();

if (envLabelEl) {
  envLabelEl.textContent = window.location.hostname;
}

if (gameUrlEl) {
  gameUrlEl.textContent = gameUrl;
}

if (qrImageEl) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(gameUrl)}`;
  qrImageEl.src = qrSrc;
}
