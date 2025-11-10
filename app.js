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

// default UUIDs (common for BLE-UART modules)
const DEFAULT_SERVICE = 'FFE0';
const DEFAULT_CHAR    = 'FFE1';

function log(v){
  elLog.textContent = v;
  console.log(v);
}

function setStatus(s){
  elStatus.textContent = 'Status: ' + s;
}

/**
 * Limpa a entrada hex e retorna a string hex limpa (lowercase) ou o default.
 * Aceita entradas como "0xFFE0", "FFE0", "ffe0", "0000ffe0-0000-1000-8000-00805f9b34fb" etc.
 */
function hexOrDefault(raw, def){
  if(!raw) return def;
  // remove 0x prefix, hífens e tudo que não for hex
  let cleaned = String(raw).replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return cleaned.length ? cleaned : def.toLowerCase();
}

/**
 * Converte uma string hex curta ou completa para um formato aceito pelo Web Bluetooth:
 * - 16-bit (<=4 chars): retorna um número (ex: parseInt('ffe0',16)) — isso é aceito como "0xFFE0"
 * - 32 chars (128-bit sem hífens): insere hífens e retorna 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
 * - qualquer outro caso: retorna a string em lowercase (preserva se já for 128-bit com hífens)
 */
function uuidFromShort(hex){
  if (typeof hex === 'number') return hex;
  if (!hex || typeof hex !== 'string') return hex;

  // remove prefix 0x e chars não-hex, já em lowercase
  let cleaned = hex.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();

  // 16-bit UUID -> devolve número (ex: 0xFFE0 como número)
  if (cleaned.length > 0 && cleaned.length <= 4) {
    return parseInt(cleaned, 16);
  }

  // 128-bit sem hífens (32 chars) -> insere hífens no formato canônico
  if (cleaned.length === 32) {
    return cleaned.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  // se já tiver hífens ou formato estranho, apenas normaliza pra lowercase e retorna
  return hex.toLowerCase();
}

async function connect() {
  try {
    setStatus('Procurando dispositivo...');
    log('Solicitando BLE device...');
    const serviceInput = hexOrDefault(inputService.value.trim(), DEFAULT_SERVICE);
    const charInput = hexOrDefault(inputChar.value.trim(), DEFAULT_CHAR);
    const filters = [
      { namePrefix: 'HC' },
      { namePrefix: 'BT' },
      { namePrefix: 'BLE' }
    ];

    // Constrói options usando o retorno de uuidFromShort
    const svc = uuidFromShort(serviceInput);
    const options = {
      filters: filters,
      optionalServices: [ svc ]
    };

    device = await navigator.bluetooth.requestDevice(options);
    setStatus('Conectando a ' + (device.name || device.id));
    log('Conectando ao GATT server...');
    server = await device.gatt.connect();
    setStatus('Conectado; descobrindo service...');

    const service = await server.getPrimaryService(uuidFromShort(serviceInput));
    txChar = await service.getCharacteristic(uuidFromShort(charInput));

    try {
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', onNotify);
      log('Notificações ativadas (se suportado)');
    } catch (e) {
      log('Notificações não disponíveis: ' + (e.message || e));
    }

    setStatus('Conectado: ' + (device.name || device.id));
    log('Pronto para enviar comandos. UUIDs: svc=' + serviceInput + ' char=' + charInput);
    device.addEventListener('gattserverdisconnected', onDisconnected);
  } catch (err) {
    console.error(err);
    setStatus('Erro: ' + (err.message || err));
    log('Erro: ' + (err.message || err));
  }
}

function onDisconnected(e){
  setStatus('Desconectado');
  log('BLE desconectado');
  device = null;
  server = null;
  txChar = null;
}

function onNotify(event){
  const value = event.target.value;
  let text = '';
  try { text = new TextDecoder().decode(value); } catch(e) { text = ''; }
  log('Recebido: ' + text);
  if(text.startsWith('ACK:ON')) setStatus('Sistema: Ligado (ACK)');
  else if(text.startsWith('ACK:OFF')) setStatus('Sistema: Desligado (ACK)');
  else if(text.startsWith('STATUS:ON')) setStatus('Sistema: Ligado');
  else if(text.startsWith('STATUS:OFF')) setStatus('Sistema: Desligado');
}

async function send(data){
  if(!txChar){
    log('Não conectado');
    return;
  }
  try {
    const encoder = new TextEncoder();
    const payload = encoder.encode(data);
    await txChar.writeValue(payload);
    log('Enviado: ' + data);
  } catch (err){
    console.error(err);
    log('Falha ao enviar: ' + (err.message || err));
  }
}

btnConnect.onclick = connect;
btnDisconnect.onclick = async () => {
  if(device && device.gatt.connected) {
    device.gatt.disconnect();
    setStatus('Desconectado (solicitado)');
    log('Desconectado manualmente');
  } else {
    setStatus('Nenhum dispositivo conectado');
  }
};

btnOn.onclick = () => {
  if (chkTextMode.checked) send('LIGAR');
  else send('a');
};
btnOff.onclick = () => {
  if (chkTextMode.checked) send('DESLIGAR');
  else send('b');
};

inputService.addEventListener('change', () => { inputService.value = hexOrDefault(inputService.value.trim(), DEFAULT_SERVICE); });
inputChar.addEventListener('change', () => { inputChar.value = hexOrDefault(inputChar.value.trim(), DEFAULT_CHAR); });

inputService.value = DEFAULT_SERVICE;
inputChar.value = DEFAULT_CHAR;

if (!navigator.bluetooth) {
  setStatus('Seu navegador NÃO suporta Web Bluetooth. Use Chrome/Edge no Android (HTTPS).');
  log('Web Bluetooth API não disponível neste navegador.');
}
