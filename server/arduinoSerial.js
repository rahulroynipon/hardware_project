import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

class ArduinoSerialBridge {
  constructor() {
    this.port = null;
    this.parser = null;
    this.portPath = process.env.ARDUINO_PORT || '/dev/cu.usbmodem11201';
    this.baudRate = 9600;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.onVoteCallback = null;
    this.onStartCallback = null;
    this.onPublishCallback = null;
    this.onResetCallback = null;
    this.onStatusCallback = null;
  }

  setCallbacks({ onVote, onStart, onPublish, onReset, onStatus }) {
    this.onVoteCallback = onVote;
    this.onStartCallback = onStart;
    this.onPublishCallback = onPublish;
    this.onResetCallback = onReset;
    this.onStatusCallback = onStatus;
  }

  async connect() {
    try {
      const ports = await SerialPort.list();
      const arduinoPort = ports.find(p => 
        (p.path && p.path.includes('usbmodem')) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes('arduino')) ||
        p.path === this.portPath
      );

      const targetPath = arduinoPort ? arduinoPort.path : this.portPath;

      this.port = new SerialPort({
        path: targetPath,
        baudRate: this.baudRate,
        autoOpen: false
      });

      this.port.open((err) => {
        if (err) {
          console.log(`[SERIAL] Port ${targetPath} not currently open: ${err.message}. Retrying in 5s...`);
          this.scheduleReconnect();
          return;
        }

        this.isConnected = true;
        console.log(`[SERIAL] Connected to Arduino Uno at ${targetPath} @ 9600 baud.`);

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
        this.parser.on('data', (line) => this.handleSerialData(line.trim()));

        this.port.on('close', () => {
          this.isConnected = false;
          console.log('[SERIAL] Arduino disconnected. Reconnecting in 5s...');
          this.scheduleReconnect();
        });

        this.port.on('error', (portErr) => {
          console.error('[SERIAL ERROR]', portErr.message);
          this.isConnected = false;
        });
      });
    } catch (e) {
      console.log(`[SERIAL] Connect error: ${e.message}. Retrying in 5s...`);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), 5000);
  }

  handleSerialData(line) {
    if (!line || line.startsWith('millis') || line.startsWith('DEVICE:') || !line.includes(',')) return;

    // CSV format: millis,event,candidate,A,B,C,D,total,closed,message
    const parts = line.split(',');
    if (parts.length >= 3) {
      const event = parts[1];
      const cand = parts[2];
      console.log(`[ARDUINO EVENT] ${event} (cand: ${cand})`);

      if (event === 'VOTE' && ['A', 'B', 'C', 'D'].includes(cand)) {
        if (this.onVoteCallback) this.onVoteCallback(cand);
      } else if (event === 'START') {
        if (this.onStartCallback) this.onStartCallback();
      } else if (event === 'RESULT') {
        if (this.onPublishCallback) this.onPublishCallback();
      } else if (event === 'RESET') {
        if (this.onResetCallback) this.onResetCallback();
      }
    }
  }

  send(command) {
    if (this.port && this.isConnected) {
      this.port.write(`${command}\n`, (err) => {
        if (err) console.error(`[SERIAL WRITE ERROR] ${err.message}`);
        else console.log(`[SERIAL SENT] -> ${command}`);
      });
    } else {
      console.log(`[SERIAL SKIP] Hardware not connected. Command: ${command}`);
    }
  }

  setCandidateCount(count) {
    this.send(`CONFIG:COUNT=${count}`);
  }

  startVoting() {
    this.send('START');
  }

  publishResults() {
    this.send('PUBLISH');
  }

  resetMachine() {
    this.send('RESET');
  }

  powerOff() {
    this.send('POWER_OFF');
  }

  powerOn() {
    this.send('POWER_ON');
  }
}

export const arduinoBridge = new ArduinoSerialBridge();
