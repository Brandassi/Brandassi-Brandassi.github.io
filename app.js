const elStatus = document.getElementById('status');
const elLog = document.getElementById('log');
const btnConnect = document.getElementById('btnConnect');
const btnDisconnect = document.getElementById('btnDisconnect');
const btnOn = document.getElementById('btnOn');
const btnOff = document.getElementById('btnOff');
const inputService = document.getElementById('serviceUuid');
const inputChar = document.getElementById('charUuid');
const chkTextMode = document.getElementById('sendTextMode');

let device = null;
let server = null;
let txChar = null;
let notifyChar = null;
let _lastConnectedState = false;

// UUIDs padrão (BLE UART)
const DEFAULT_SERVICE = 'FFE0';
const DEFAULT_CHAR = 'FFE1';

/* --- Funções de feedback --- */
const clickSound = new Audio('assets/click.wav'); // coloque um som curto tipo "click.mp3" dentro de /assets/

function playFeedback() {
  try {
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {}); // ignora erros de autoplay
  } catch (e) {}

  if ('vibrate' in navigator) {
    navigator.vibrate(60); // vibra 60ms se disponível
  }
}

/* --- Logging --- */
function timestamp() {
  return new Date().toLocaleTimeString();
}
function addLogConsole(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}
function log(v) {
  addLogConsole(String(v));
}
function setStatus(s) {
  if (elStatus) elStatus.textContent = 'Status: ' + s;
}

/* --- Utilidades --- */
function hexOrDefault(raw, def) {
  if (!raw) return def;
  let cleaned = String(raw).replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return cleaned.length ? cleaned : def.toLowerCase();
}
function uuidFromShort(hex) {
  if (typeof hex === 'number') return hex;
  if (!hex || typeof hex !== 'string') return hex;
  let cleaned = hex.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (cleaned.length > 0 && cleaned.length <= 4) return parseInt(cleaned, 16);
  if (cleaned.length === 32)
    return cleaned.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  return hex.toLowerCase();
}

/* --- Conexão BLE --- */
async function connect() {
  playFeedback();
  try {
    setStatus('Procurando dispositivo...');
    log('Solicitando dispositivo BLE ao usuário...');
    const serviceInput = hexOrDefault(inputService.value.trim(), DEFAULT_SERVICE);
    const charInput = hexOrDefault(inputChar.value.trim(), DEFAULT_CHAR);
    const filters = [{ namePrefix: 'HC' }, { namePrefix: 'BT' }, { namePrefix: 'BLE' }];
    const svc = uuidFromShort(serviceInput);
    const options = { filters: filters, optionalServices: [svc] };
    device = await navigator.bluetooth.requestDevice(options);
    log('Dispositivo selecionado: ' + (device.name || device.id));
    setStatus('Conectando a ' + (device.name || device.id));
    server = await device.gatt.connect();
    const service = await server.getPrimaryService(uuidFromShort(serviceInput));
    txChar = await service.getCharacteristic(uuidFromShort(charInput));
    try {
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', onNotify);
    } catch {}
    setStatus('Conectado: ' + (device.name || device.id));
    device.addEventListener('gattserverdisconnected', onDisconnected);
    _lastConnectedState = true;
    addLogConsole('Estado de conexão: conectado');
  } catch (err) {
    console.error(err);
    setStatus('Erro: ' + (err.message || err));
    log('Erro ao conectar: ' + (err.message || err));
  }
}

function onDisconnected() {
  setStatus('Desconectado');
  log('BLE desconectado (evento)');
  device = null;
  server = null;
  txChar = null;
  if (_lastConnectedState) {
    addLogConsole('Estado de conexão: desconectado');
    _lastConnectedState = false;
  }
}

function onNotify(event) {
  const value = event.target.value;
  let text = '';
  try {
    text = new TextDecoder().decode(value);
  } catch (e) {}
  log('Recebido: ' + text);
  if (text.startsWith('ACK:ON')) setStatus('Sistema: Ligado (ACK)');
  else if (text.startsWith('ACK:OFF')) setStatus('Sistema: Desligado (ACK)');
}

/* --- Envio --- */
async function send(data) {
  if (!txChar) {
    log('Enviar cancelado: não conectado');
    return;
  }
  try {
    const encoder = new TextEncoder();
    const payload = encoder.encode(data);
    await txChar.writeValue(payload);
    log('Enviado: ' + data);
  } catch (err) {
    console.error(err);
    log('Erro ao enviar: ' + (err.message || err));
  }
}

/* --- Ações dos botões --- */
btnConnect.onclick = () => {
  playFeedback();
  addLogConsole('Botão CONECTAR clicado');
  connect();
};
btnDisconnect.onclick = () => {
  playFeedback();
  addLogConsole('Botão DESCONECTAR clicado');
  if (device && device.gatt && device.gatt.connected) {
    device.gatt.disconnect();
    setStatus('Desconectado (solicitado)');
  } else {
    setStatus('Nenhum dispositivo conectado');
  }
};
btnOn.onclick = () => {
  playFeedback();
  addLogConsole('Botão LIGAR clicado');
  send(chkTextMode.checked ? 'LIGAR' : 'a');
};
btnOff.onclick = () => {
  playFeedback();
  addLogConsole('Botão DESLIGAR clicado');
  send(chkTextMode.checked ? 'DESLIGAR' : 'b');
};

/* --- Validação dos campos --- */
inputService.addEventListener('change', () => {
  inputService.value = hexOrDefault(inputService.value.trim(), DEFAULT_SERVICE);
});
inputChar.addEventListener('change', () => {
  inputChar.value = hexOrDefault(inputChar.value.trim(), DEFAULT_CHAR);
});
inputService.value = DEFAULT_SERVICE;
inputChar.value = DEFAULT_CHAR;

/* --- Monitor de conexão --- */
setInterval(() => {
  try {
    const isConnected = !!(device && device.gatt && device.gatt.connected);
    if (isConnected !== _lastConnectedState) {
      _lastConnectedState = isConnected;
      addLogConsole('Mudança de conexão: ' + (isConnected ? 'conectado' : 'desconectado'));
      setStatus(isConnected ? 'Conectado' : 'Desconectado');
    }
  } catch (e) {}
}, 2000);

/* --- Verificação de suporte --- */
if (!navigator.bluetooth) {
  setStatus('Seu navegador NÃO suporta Web Bluetooth. Use Chrome/Edge no Android (HTTPS).');
  log('Web Bluetooth API não disponível.');
} else {
  log('Web Bluetooth disponível.');
}
