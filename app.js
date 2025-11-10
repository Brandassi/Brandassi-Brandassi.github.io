const elStatus = document.getElementById('status');
// mantemos a referência caso queira usar depois, mas NÃO vamos escrever no DOM
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
let _lastConnectedState = false; // para detectar mudanças e logar

// default UUIDs (common for BLE-UART modules)
const DEFAULT_SERVICE = 'FFE0';
const DEFAULT_CHAR    = 'FFE1';

/* --- Logging utilities (APENAS console) --- */
function timestamp() {
  return new Date().toLocaleTimeString();
}
function addLogConsole(msg) {
  // só escreve no console (não altera o DOM)
  console.log(`[${timestamp()}] ${msg}`);
}
// compat wrapper (mantém chamadas antigas)
function log(v) {
  addLogConsole(String(v));
}

function setStatus(s){
  if (elStatus) elStatus.textContent = 'Status: ' + s;
}

/**
 * Limpa a entrada hex e retorna a string hex limpa (lowercase) ou o default.
 */
function hexOrDefault(raw, def){
  if(!raw) return def;
  let cleaned = String(raw).replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  return cleaned.length ? cleaned : def.toLowerCase();
}

/**
 * Converte uma string hex curta ou completa para um formato aceito pelo Web Bluetooth
 */
function uuidFromShort(hex){
  if (typeof hex === 'number') return hex;
  if (!hex || typeof hex !== 'string') return hex;

  let cleaned = hex.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();

  if (cleaned.length > 0 && cleaned.length <= 4) {
    return parseInt(cleaned, 16);
  }

  if (cleaned.length === 32) {
    return cleaned.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  return hex.toLowerCase();
}

/* --- Conexão e BLE --- */
async function connect() {
  try {
    setStatus('Procurando dispositivo...');
    log('Solicitando dispositivo BLE ao usuário...');
    const serviceInput = hexOrDefault(inputService.value.trim(), DEFAULT_SERVICE);
    const charInput = hexOrDefault(inputChar.value.trim(), DEFAULT_CHAR);
    const filters = [
      { namePrefix: 'HC' },
      { namePrefix: 'BT' },
      { namePrefix: 'BLE' }
    ];

    const svc = uuidFromShort(serviceInput);
    const options = {
      filters: filters,
      optionalServices: [ svc ]
    };

    device = await navigator.bluetooth.requestDevice(options);
    log('Dispositivo selecionado: ' + (device.name || device.id));
    setStatus('Conectando a ' + (device.name || device.id));
    log('Conectando ao GATT server...');
    server = await device.gatt.connect();
    setStatus('Conectado; descobrindo service...');
    log('Conectado ao GATT server');

    const service = await server.getPrimaryService(uuidFromShort(serviceInput));
    txChar = await service.getCharacteristic(uuidFromShort(charInput));

    try {
      // tentamos ativar notificações; não é obrigatório que o módulo suporte
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', onNotify);
      log('Notificações ativadas (se suportado pelo módulo)');
    } catch (e) {
      log('Notificações não disponíveis: ' + (e.message || e));
    }

    setStatus('Conectado: ' + (device.name || device.id));
    log('Pronto para enviar comandos. svc=' + serviceInput + ' char=' + charInput);

    device.addEventListener('gattserverdisconnected', onDisconnected);

    // atualiza estado inicial
    _lastConnectedState = true;
    addLogConsole('Estado de conexão: conectado');

  } catch (err) {
    console.error(err);
    setStatus('Erro: ' + (err.message || err));
    log('Erro ao conectar: ' + (err.message || err));
  }
}

function onDisconnected(e){
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

function onNotify(event){
  const value = event.target.value;
  let text = '';
  try { text = new TextDecoder().decode(value); } catch(e) { text = ''; }
  log('Recebido do dispositivo: ' + text);
  if(text.startsWith('ACK:ON')) setStatus('Sistema: Ligado (ACK)');
  else if(text.startsWith('ACK:OFF')) setStatus('Sistema: Desligado (ACK)');
  else if(text.startsWith('STATUS:ON')) setStatus('Sistema: Ligado');
  else if(text.startsWith('STATUS:OFF')) setStatus('Sistema: Desligado');
}

/* --- Envia dados --- */
async function send(data){
  if(!txChar){
    log('Enviar cancelado: não conectado');
    return;
  }
  try {
    const encoder = new TextEncoder();
    const payload = encoder.encode(data);
    await txChar.writeValue(payload);
    log('Enviado ao dispositivo: ' + data);
  } catch (err){
    console.error(err);
    log('Falha ao enviar: ' + (err.message || err));
  }
}

/* --- Botões / UI --- */
btnConnect.onclick = () => {
  addLogConsole('Ação: Botão CONECTAR pressionado');
  connect();
};

btnDisconnect.onclick = async () => {
  addLogConsole('Ação: Botão DESCONECTAR pressionado');
  if(device && device.gatt && device.gatt.connected) {
    device.gatt.disconnect();
    setStatus('Desconectado (solicitado)');
    addLogConsole('Desconexão solicitada ao dispositivo');
  } else {
    setStatus('Nenhum dispositivo conectado');
    addLogConsole('Nenhum dispositivo conectado no momento');
  }
};

btnOn.onclick = () => {
  addLogConsole('Ação: Botão LIGAR clicado');
  if (chkTextMode.checked) send('LIGAR');
  else send('a');
};
btnOff.onclick = () => {
  addLogConsole('Ação: Botão DESLIGAR clicado');
  if (chkTextMode.checked) send('DESLIGAR');
  else send('b');
};

inputService.addEventListener('change', () => { inputService.value = hexOrDefault(inputService.value.trim(), DEFAULT_SERVICE); });
inputChar.addEventListener('change', () => { inputChar.value = hexOrDefault(inputChar.value.trim(), DEFAULT_CHAR); });

inputService.value = DEFAULT_SERVICE;
inputChar.value = DEFAULT_CHAR;

/* --- Monitor de conexão (opcional) --- */
setInterval(() => {
  try {
    const isConnected = !!(device && device.gatt && device.gatt.connected);
    if (isConnected !== _lastConnectedState) {
      _lastConnectedState = isConnected;
      addLogConsole('Mudança de conexão detectada: ' + (isConnected ? 'conectado' : 'desconectado'));
      setStatus(isConnected ? 'Conectado' : 'Desconectado');
    }
  } catch (e) {
    console.warn('Erro no monitor de conexão', e);
  }
}, 2000);

/* --- Verificação inicial de suporte a Web Bluetooth --- */
if (!navigator.bluetooth) {
  setStatus('Seu navegador NÃO suporta Web Bluetooth. Use Chrome/Edge no Android (HTTPS).');
  log('Web Bluetooth API não disponível neste navegador.');
} else {
  log('Web Bluetooth disponível neste navegador.');
  addLogConsole('Pronto — aguarde conexão quando clicar em "Conectar Bluetooth"');
}
