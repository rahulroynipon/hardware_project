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
    this.onConnectCallback = null;
    this.onInspectCallback = null;
    this.onVoteBlockedCallback = null;
  }

  setCallbacks({ onVote, onStart, onPublish, onReset, onStatus, onConnect, onInspect, onVoteBlocked }) {
    this.onVoteCallback = onVote;
    this.onStartCallback = onStart;
    this.onPublishCallback = onPublish;
    this.onResetCallback = onReset;
    this.onStatusCallback = onStatus;
    this.onConnectCallback = onConnect;
    this.onInspectCallback = onInspect;
    this.onVoteBlockedCallback = onVoteBlocked;
  }

  async connect() {
    if (this.isConnected && this.port && this.port.isOpen) {
      return;
    }
    this.isManualDisconnect = false;
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
        autoOpen: false,
        hupcl: false
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

        // Trigger onConnect callback to sync live election candidate count with Arduino
        if (this.onConnectCallback) {
          try {
            this.onConnectCallback();
          } catch (cbErr) {
            console.error('[SERIAL ONCONNECT ERROR]', cbErr);
          }
        }

        this.port.on('close', () => {
          this.isConnected = false;
          if (!this.isManualDisconnect) {
            console.log('[SERIAL] Arduino disconnected. Reconnecting in 5s...');
            this.scheduleReconnect();
          } else {
            console.log('[SERIAL] Port closed for firmware update.');
          }
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

  disconnect() {
    this.isManualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    return new Promise((resolve) => {
      const finish = () => {
        this.isConnected = false;
        this.port = null;
        this.parser = null;
        setTimeout(resolve, 800);
      };

      if (this.port && this.port.isOpen) {
        try {
          if (this.parser) this.port.unpipe(this.parser);
        } catch (e) {}

        this.port.close((err) => {
          if (err) console.error('[SERIAL CLOSE ERR]', err.message);
          finish();
        });
      } else {
        finish();
      }
    });
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
      } else if (event === 'REMOTE_VOTE') {
        console.log(`[ARDUINO ACK] Simulated vote recorded on Arduino LCD for Candidate ${cand}`);
      } else if (event === 'INSPECT' || event === 'PAGE') {
        if (this.onInspectCallback) this.onInspectCallback(cand);
      } else if (event === 'VOTE_BLOCKED') {
        if (this.onVoteBlockedCallback) this.onVoteBlockedCallback(cand, parts[parts.length - 1]);
      } else if (event === 'START') {
        if (parts[parts.length - 1] === 'MachineReady') {
          console.log('[ARDUINO] Arduino boot completed. Synchronizing state...');
          if (this.onConnectCallback) {
            try { this.onConnectCallback(); } catch (e) { console.error('[ONCONNECT ERROR]', e); }
          }
          return;
        }
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

  simulateVote(slot) {
    this.send(`VOTE:${slot.toUpperCase()}`);
  }

  syncState(state, tallies = [0, 0, 0, 0]) {
    const s = String(state || 'VOTING').toUpperCase();
    const t = Array.isArray(tallies) ? tallies : [tallies?.A || 0, tallies?.B || 0, tallies?.C || 0, tallies?.D || 0];
    const cleanTallies = [t[0] || 0, t[1] || 0, t[2] || 0, t[3] || 0];
    this.send(`SYNC:${s}:${cleanTallies.join(',')}`);
  }

  syncTallies(tallies) {
    if (Array.isArray(tallies)) {
      this.send(`SYNC:${tallies.slice(0, 4).join(',')}`);
    } else if (tallies && typeof tallies === 'object') {
      const a = tallies.A ?? tallies[0] ?? 0;
      const b = tallies.B ?? tallies[1] ?? 0;
      const c = tallies.C ?? tallies[2] ?? 0;
      const d = tallies.D ?? tallies[3] ?? 0;
      this.send(`SYNC:${a},${b},${c},${d}`);
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
