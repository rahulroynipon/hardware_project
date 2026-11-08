#include <EEPROM.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <ctype.h>
#include <string.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

// Hardware Pin Definitions
const byte candidatePins[4] = {3, 4, 5, 6};
const byte resultButton = 7;
const byte greenLED = 13;
const byte redLED = 12;

const char candidateNames[4] = {'A', 'B', 'C', 'D'};
byte activeCandidateCount = 4;

const unsigned long debounceDelay = 40;
const unsigned long resetHoldTime = 3000;
const unsigned long powerHoldTime = 5000;
const unsigned long publishLockout = 2500;
const unsigned long actionCooldown = 1000;
const unsigned long comboWindow = 90;

// State Machine & EEPROM
const uint32_t EEPROM_MAGIC = 0x564F5445UL;

enum MachineState : byte {
  STATE_STANDBY = 0,
  STATE_VOTING = 1,
  STATE_PUBLISHED = 2
};

struct ElectionData {
  uint32_t magic;
  uint16_t votes[4];
  uint8_t state;
  uint16_t checksum;
};

uint16_t votes[4] = {0, 0, 0, 0};
MachineState machineState = STATE_STANDBY;

// System & Timing Flags
bool lastReading[5] = {HIGH, HIGH, HIGH, HIGH, HIGH};
bool stableState[5] = {HIGH, HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[5] = {0, 0, 0, 0, 0};

bool comboActive = false;
bool comboHoldTriggered = false;
unsigned long comboPressStart = 0;
bool isHardwareTestModeActive = false;
bool pin7Suppressed = false;
bool dPending = false;
unsigned long dPendingTime = 0;

bool resultButtonHeld = false;
bool resetTriggered = false;
bool isPoweredOn = true;
bool powerActionTriggered = false;
unsigned long resultPressStart = 0;
unsigned long lastButtonActionTime = 0;
unsigned long votingStartTime = 0;

bool messageActive = false;
unsigned long messageUntil = 0;
byte statsPage = 5;

char serialBuffer[32];
byte serialBufferIndex = 0;

// Forward Declarations
void startVoting();
void publishResults();
void resetElection();
void powerOffMachine();
void powerOnMachine();
void castVote(byte candidate, bool isRemote = false);
void logEvent(const char *event, char candidate, const char *message);
void logStatistics();
void showWelcome();
void showStandbyScreen();
void showReadyScreen();
void showMessage(const char *line1, const char *line2, unsigned long duration);
void showClosedScreen();
void showStatsPage();

// Helper Functions
uint32_t totalVotes() {
  uint32_t total = 0;
  for (byte i = 0; i < activeCandidateCount; i++) {
    total += votes[i];
  }
  return total;
}

uint16_t calculateChecksum(const ElectionData &data) {
  uint16_t sum = 0x5A3C;
  sum ^= (uint16_t)data.magic;
  sum ^= (uint16_t)(data.magic >> 16);
  sum ^= data.state;
  for (byte i = 0; i < 4; i++) {
    sum ^= data.votes[i];
  }
  return sum;
}

// EEPROM Storage
void saveElection() {
  ElectionData data;
  data.magic = EEPROM_MAGIC;

  for (byte i = 0; i < 4; i++) {
    data.votes[i] = votes[i];
  }

  data.state = (uint8_t)machineState;
  data.checksum = calculateChecksum(data);

  EEPROM.put(0, data);
}

void loadElection() {
  ElectionData data;
  EEPROM.get(0, data);

  bool valid = (data.magic == EEPROM_MAGIC) && (data.state <= 2) &&
               (data.checksum == calculateChecksum(data));

  if (valid) {
    for (byte i = 0; i < 4; i++) {
      votes[i] = data.votes[i];
    }
    machineState = (MachineState)data.state;
  } else {
    for (byte i = 0; i < 4; i++) {
      votes[i] = 0;
    }
    machineState = STATE_STANDBY;
    saveElection();
  }
}

// Serial Telemetry
void logEvent(const char *event, char candidate, const char *message) {
  Serial.print(millis());
  Serial.print(',');
  Serial.print(event);
  Serial.print(',');
  Serial.print(candidate);

  for (byte i = 0; i < 4; i++) {
    Serial.print(',');
    Serial.print(votes[i]);
  }

  Serial.print(',');
  Serial.print(totalVotes());
  Serial.print(',');
  Serial.print((machineState == STATE_PUBLISHED) ? 1 : 0);
  Serial.print(',');
  Serial.println(message);
}

void logStatistics() {
  uint32_t total = totalVotes();

  for (byte i = 0; i < activeCandidateCount; i++) {
    float percentage = total > 0 ? (votes[i] * 100.0f) / total : 0.0f;
    char message[20];
    snprintf(message, sizeof(message), "percent=%.1f", percentage);
    logEvent("STAT", candidateNames[i], message);
  }
}

// LCD Display Functions
void showWelcome() {
  lcd.clear();
  lcd.setCursor(1, 0);
  lcd.print(F("DIGITAL VOTING"));
  lcd.setCursor(0, 1);
  lcd.print(F("CITY UNIVERSITY "));
  delay(1200);
  lcd.clear();
}

void showStandbyScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("TO START VOTING "));
  lcd.setCursor(0, 1);
  lcd.print(F("PRESS TO START  "));
  messageActive = false;
}

void showReadyScreen() {
  lcd.clear();

  char row0[17];
  char row1[17];

  snprintf(row0, sizeof(row0), "A:%-4u  B:%-4u", votes[0], votes[1]);

  if (activeCandidateCount == 2) {
    snprintf(row1, sizeof(row1), "[2 CANDIDATES]  ");
  } else if (activeCandidateCount == 3) {
    snprintf(row1, sizeof(row1), "C:%-4u  [3 CAND]", votes[2]);
  } else {
    snprintf(row1, sizeof(row1), "C:%-4u  D:%-4u", votes[2], votes[3]);
  }

  lcd.setCursor(0, 0);
  lcd.print(row0);
  lcd.setCursor(0, 1);
  lcd.print(row1);

  messageActive = false;
}

void showMessage(const char *line1, const char *line2, unsigned long duration) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);

  messageActive = true;
  messageUntil = millis() + duration;
}

void showClosedScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(F("RESULT PUBLISHED"));
  lcd.setCursor(0, 1);
  lcd.print(F("Voting is closed"));

  messageActive = false;
}

void showStatsPage() {
  lcd.clear();
  uint32_t total = totalVotes();

  if (statsPage == 0) {
    lcd.setCursor(0, 0);
    lcd.print(F("TOTAL VOTES"));
    lcd.setCursor(0, 1);
    lcd.print(F("Total: "));
    lcd.print(total);
  } else if (statsPage >= 1 && statsPage <= activeCandidateCount) {
    byte i = statsPage - 1;
    float percentage = total > 0 ? (votes[i] * 100.0f) / total : 0.0f;

    lcd.setCursor(0, 0);
    lcd.print(F("Candidate "));
    lcd.print(candidateNames[i]);

    lcd.setCursor(0, 1);
    lcd.print(F("Votes:"));
    lcd.print(votes[i]);
    lcd.print(' ');

    char percentText[8];
    dtostrf(percentage, 4, 1, percentText);
    lcd.print(percentText);
    lcd.print('%');
  } else {
    int highest = votes[0];

    for (byte i = 1; i < activeCandidateCount; i++) {
      if (votes[i] > highest) {
        highest = votes[i];
      }
    }

    byte winnerCount = 0;
    char winner = '-';

    for (byte i = 0; i < activeCandidateCount; i++) {
      if (votes[i] == highest) {
        winner = candidateNames[i];
        winnerCount++;
      }
    }

    if (total == 0) {
      lcd.setCursor(0, 0);
      lcd.print(F("NO VOTES CAST   "));
      lcd.setCursor(0, 1);
      lcd.print(F("Total: 0        "));
    } else if (winnerCount > 1) {
      lcd.setCursor(0, 0);
      lcd.print(F("TIE - NO WINNER "));
      lcd.setCursor(0, 1);
      lcd.print(F("Top votes: "));
      lcd.print(highest);
      lcd.print(F("   "));
    } else {
      float winnerPct = (highest * 100.0f) / total;
      lcd.setCursor(0, 0);
      lcd.print(F("WINNER: Cand "));
      lcd.print(winner);
      lcd.print(F("  "));

      lcd.setCursor(0, 1);
      lcd.print(F("V:"));
      lcd.print(highest);
      lcd.print(F(" ("));
      char pctStr[6];
      dtostrf(winnerPct, 3, 0, pctStr);
      lcd.print(pctStr);
      lcd.print(F("%)   "));
    }
  }

  messageActive = false;
}

// Machine Control Functions
void startVoting() {
  machineState = STATE_VOTING;
  lastButtonActionTime = millis();
  votingStartTime = millis();
  saveElection();

  digitalWrite(greenLED, HIGH);
  digitalWrite(redLED, LOW);

  logEvent("START", '7', "VotingStarted");
  showMessage("VOTING STARTED", "Cast your vote!", 1200);
}

void castVote(byte candidate, bool isRemote) {
  if (machineState == STATE_STANDBY) {
    digitalWrite(greenLED, LOW);
    digitalWrite(redLED, LOW);
    logEvent("VOTE_BLOCKED", candidateNames[candidate], "VotingNotStarted");
    showMessage("NOT STARTED", "Press to Start", 1500);
    return;
  }

  if (machineState == STATE_PUBLISHED) {
    digitalWrite(greenLED, LOW);
    digitalWrite(redLED, HIGH);
    logEvent("VOTE_BLOCKED", candidateNames[candidate], "ResultPublished");
    showMessage("RESULT PUBLISHED", "Voting is closed", 1500);
    return;
  }

  if (candidate >= activeCandidateCount) {
    if (isRemote) {
      activeCandidateCount = candidate + 1;
      if (activeCandidateCount > 4) {
        activeCandidateCount = 4;
      }
    } else {
      digitalWrite(greenLED, LOW);
      digitalWrite(redLED, HIGH);
      logEvent("VOTE_BLOCKED", candidateNames[candidate], "CandidateSlotDisabled");
      showMessage("  NO CANDIDATE  ", " SLOT DISABLED  ", 1500);
      digitalWrite(redLED, (machineState == STATE_PUBLISHED) ? HIGH : LOW);
      digitalWrite(greenLED, (machineState == STATE_VOTING) ? HIGH : LOW);
      return;
    }
  }

  if (votes[candidate] == 65535) {
    showMessage("VOTE LIMIT", "Contact supervisor", 2000);
    logEvent("ERROR", candidateNames[candidate], "VoteLimit");
    return;
  }

  if (isHardwareTestModeActive) {
    digitalWrite(redLED, LOW);
    if (machineState == STATE_VOTING) {
      digitalWrite(greenLED, LOW);
      delay(200);
      digitalWrite(greenLED, HIGH);
    } else {
      digitalWrite(greenLED, HIGH);
      delay(300);
      digitalWrite(greenLED, LOW);
    }

    char candName = candidateNames[candidate];
    logEvent("TEST_VOTE", candName, "TestVoteSimulated");

    char row1[17];
    snprintf(row1, sizeof(row1), "Candidate %c", candName);
    showMessage("Test Vote Rec.", row1, 800);
    return;
  }

  votes[candidate]++;
  saveElection();

  digitalWrite(redLED, LOW);
  if (machineState == STATE_VOTING) {
    digitalWrite(greenLED, LOW);
    delay(200);
    digitalWrite(greenLED, HIGH);
  } else {
    digitalWrite(greenLED, HIGH);
    delay(300);
    digitalWrite(greenLED, LOW);
  }

  if (isRemote) {
    logEvent("REMOTE_VOTE", candidateNames[candidate], "RemoteVoteRecorded");
  } else {
    logEvent("VOTE", candidateNames[candidate], "VoteRecorded");
  }

  char line2[17];
  snprintf(line2, sizeof(line2), "Candidate %c", candidateNames[candidate]);
  showMessage("Vote Recorded", line2, 800);
}

void publishResults() {
  machineState = STATE_PUBLISHED;
  lastButtonActionTime = millis();
  saveElection();

  digitalWrite(greenLED, LOW);
  digitalWrite(redLED, HIGH);
  statsPage = 5;

  logEvent("RESULT", '7', "ResultsPublished");
  logStatistics();
  showMessage("RESULT PUBLISHED", "Voting is closed", 1200);
}

void resetElection() {
  for (byte i = 0; i < 4; i++) {
    votes[i] = 0;
  }

  machineState = STATE_STANDBY;
  lastButtonActionTime = millis();
  statsPage = 5;
  saveElection();

  digitalWrite(greenLED, LOW);
  digitalWrite(redLED, LOW);

  logEvent("RESET", '7', "CountsResetPressToStart");
  showMessage("VOTES RESET", "Press to Start", 1500);
}

void powerOffMachine() {
  isPoweredOn = false;
  saveElection();

  digitalWrite(greenLED, LOW);
  digitalWrite(redLED, LOW);

  lcd.clear();
  lcd.setCursor(1, 0);
  lcd.print(F("POWERING OFF..."));
  delay(800);
  lcd.clear();
  lcd.noBacklight();

  logEvent("POWER", '7', "PowerOff");
}

void powerOnMachine() {
  isPoweredOn = true;
  lastButtonActionTime = millis();

  lcd.backlight();
  lcd.clear();
  lcd.setCursor(1, 0);
  lcd.print(F("POWERING ON..."));
  delay(1000);
  lcd.clear();

  logEvent("POWER", '7', "PowerOn");

  if (machineState == STATE_PUBLISHED) {
    digitalWrite(redLED, HIGH);
    digitalWrite(greenLED, LOW);
    showStatsPage();
  } else if (machineState == STATE_VOTING) {
    digitalWrite(greenLED, HIGH);
    digitalWrite(redLED, LOW);
    showReadyScreen();
  } else {
    digitalWrite(greenLED, LOW);
    digitalWrite(redLED, LOW);
    showStandbyScreen();
  }
}

// Button Debounce Handler
bool updateButton(byte index, byte pin) {
  bool reading = digitalRead(pin);

  if (reading != lastReading[index]) {
    lastDebounceTime[index] = millis();
    lastReading[index] = reading;
  }

  if (millis() - lastDebounceTime[index] >= debounceDelay) {
    if (reading != stableState[index]) {
      stableState[index] = reading;
      return true;
    }
  }

  return false;
}

// Serial Command Handler
void processSerialCommand(const char *cmd) {
  while (*cmd == ' ') {
    cmd++;
  }

  if (strcasecmp(cmd, "STATUS") == 0 || strcasecmp(cmd, "GET_STATUS") == 0) {
    logEvent("STATUS", '-', "StatusSync");
    logStatistics();
  } else if (strcasecmp(cmd, "PING") == 0) {
    logEvent("PONG", '-', "DeviceOnline");
  } else if (strncasecmp(cmd, "VOTE", 4) == 0 ||
             strncasecmp(cmd, "SIM_VOTE", 8) == 0) {
    const char *p = strchr(cmd, ':');
    if (!p) p = strchr(cmd, '=');
    if (!p) p = strchr(cmd, ' ');
    if (!p) p = strchr(cmd, '_');

    char slotChar = 0;
    if (p) {
      p++;
      while (*p == ' ') p++;
      slotChar = (char)toupper(*p);
    } else {
      size_t len = strlen(cmd);
      if (len > 4) {
        slotChar = (char)toupper(cmd[len - 1]);
      }
    }

    if (slotChar >= 'A' && slotChar <= 'D') {
      byte candIndex = slotChar - 'A';
      castVote(candIndex, true);
    } else {
      logEvent("VOTE_ERROR", '?', "InvalidCandidateSlot");
    }
  } else if (strncasecmp(cmd, "SYNC:", 5) == 0 ||
             strncasecmp(cmd, "SET_VOTES:", 10) == 0) {
    const char *p = strchr(cmd, ':');
    if (p) {
      p++;
      int targetState = -1;
      if (strncasecmp(p, "STANDBY", 7) == 0) {
        targetState = STATE_STANDBY;
        p = strchr(p, ':');
        if (p) p++;
      } else if (strncasecmp(p, "PUBLISHED", 9) == 0 ||
                 strncasecmp(p, "CLOSED", 6) == 0) {
        targetState = STATE_PUBLISHED;
        p = strchr(p, ':');
        if (p) p++;
      } else if (strncasecmp(p, "VOTING", 6) == 0 ||
                 strncasecmp(p, "LIVE", 4) == 0) {
        targetState = STATE_VOTING;
        p = strchr(p, ':');
        if (p) p++;
      }

      int v0 = 0, v1 = 0, v2 = 0, v3 = 0;
      if (p && sscanf(p, "%d,%d,%d,%d", &v0, &v1, &v2, &v3) >= 1) {
        votes[0] = (uint16_t)(v0 >= 0 ? v0 : 0);
        votes[1] = (uint16_t)(v1 >= 0 ? v1 : 0);
        votes[2] = (uint16_t)(v2 >= 0 ? v2 : 0);
        votes[3] = (uint16_t)(v3 >= 0 ? v3 : 0);
      }

      if (targetState == STATE_STANDBY) {
        machineState = STATE_STANDBY;
        digitalWrite(greenLED, LOW);
        digitalWrite(redLED, LOW);
      } else if (targetState == STATE_PUBLISHED) {
        machineState = STATE_PUBLISHED;
        digitalWrite(greenLED, LOW);
        digitalWrite(redLED, HIGH);
        statsPage = 5;
      } else {
        machineState = STATE_VOTING;
        digitalWrite(greenLED, HIGH);
        digitalWrite(redLED, LOW);
      }
      lastButtonActionTime = millis();
      votingStartTime = millis();
      saveElection();
      logEvent("SYNC_OK",
               (machineState == STATE_STANDBY     ? 'S'
                : machineState == STATE_PUBLISHED ? 'P'
                                                  : 'V'),
               "StateSynced");
      showMessage("HARDWARE SYNCING", "PLEASE WAIT...  ", 2500);
    }
  } else if (strcasecmp(cmd, "START") == 0 ||
             strcasecmp(cmd, "START_VOTING") == 0) {
    startVoting();
  } else if (strcasecmp(cmd, "PUBLISH") == 0 || strcasecmp(cmd, "CLOSE") == 0) {
    publishResults();
  } else if (strcasecmp(cmd, "RESET") == 0) {
    resetElection();
  } else if (strcasecmp(cmd, "POWER_OFF") == 0 ||
             strcasecmp(cmd, "SLEEP") == 0) {
    powerOffMachine();
  } else if (strcasecmp(cmd, "POWER_ON") == 0 || strcasecmp(cmd, "WAKE") == 0) {
    powerOnMachine();
  } else if (strcasecmp(cmd, "CYCLE") == 0 ||
             strcasecmp(cmd, "CYCLE_STATS") == 0 ||
             strcasecmp(cmd, "PAGE") == 0) {
    if (machineState == STATE_PUBLISHED) {
      statsPage = (statsPage + 1) % 6;
      showStatsPage();
      char pageCode = (statsPage == 0)   ? '0'
                      : (statsPage == 5) ? '5'
                                         : ('0' + statsPage);
      logEvent("PAGE", pageCode, "StatsPageCycled");
    }
  } else if (strcasecmp(cmd, "SHOW_WINNER") == 0) {
    if (machineState == STATE_PUBLISHED) {
      statsPage = 5;
      showStatsPage();
      logEvent("PAGE", '5', "WinnerDisplayed");
    }
  } else if (strcasecmp(cmd, "SHOW_TOTAL") == 0) {
    if (machineState == STATE_PUBLISHED) {
      statsPage = 0;
      showStatsPage();
      logEvent("PAGE", '0', "TotalDisplayed");
    }
  } else if (strncasecmp(cmd, "SHOW_CANDIDATE:", 15) == 0 ||
             strncasecmp(cmd, "PAGE:", 5) == 0) {
    if (machineState == STATE_PUBLISHED) {
      const char *p = strchr(cmd, ':');
      if (p) {
        p++;
        char c = toupper(*p);
        if (c >= 'A' && c <= 'D') {
          statsPage = (c - 'A') + 1;
        } else if (c >= '0' && c <= '5') {
          statsPage = c - '0';
        }
        showStatsPage();
        char pageCode = (statsPage == 0)   ? '0'
                        : (statsPage == 5) ? '5'
                                           : ('0' + statsPage);
        logEvent("PAGE", pageCode, "CandidateDisplayed");
      }
    }
  } else if (strncasecmp(cmd, "CONFIG:COUNT=", 13) == 0 ||
             strncasecmp(cmd, "SET_CANDIDATES:", 15) == 0 ||
             strncasecmp(cmd, "CANDIDATES:", 11) == 0) {
    const char *p = strchr(cmd, '=');
    if (!p) p = strchr(cmd, ':');
    if (p) {
      byte cnt = atoi(p + 1);
      if (cnt >= 2 && cnt <= 4) {
        activeCandidateCount = cnt;
        logEvent("CONFIG", '0' + activeCandidateCount, "ActiveCandidateCountSet");
        if (machineState == STATE_VOTING) {
          showReadyScreen();
        }
      }
    }
  } else if (strcasecmp(cmd, "MODE:TEST") == 0 ||
             strcasecmp(cmd, "TEST_MODE") == 0) {
    isHardwareTestModeActive = true;
    showMessage(" MODE SWITCHED  ", " TEST MODE ON   ", 2500);
    logEvent("MODE_SWITCH", 'T', "TestModeFromWeb");
  } else if (strcasecmp(cmd, "MODE:VOTING") == 0 ||
             strcasecmp(cmd, "LIVE_MODE") == 0 ||
             strcasecmp(cmd, "MODE:LIVE") == 0) {
    isHardwareTestModeActive = false;
    showMessage(" MODE SWITCHED  ", " LIVE VOTING ON ", 2500);
    logEvent("MODE_SWITCH", 'V', "LiveModeFromWeb");
  } else if (strcasecmp(cmd, "IDENTIFY") == 0) {
    Serial.println("DEVICE:CITY_UNIVERSITY_VOTING_MACHINE_V1");
  } else {
    logEvent("UNKNOWN_CMD", '?', cmd);
  }
}

void handleSerialInput() {
  while (Serial.available() > 0) {
    char inChar = (char)Serial.read();

    if (inChar == '\r' || inChar == '\n') {
      if (serialBufferIndex > 0) {
        serialBuffer[serialBufferIndex] = '\0';
        processSerialCommand(serialBuffer);
        serialBufferIndex = 0;
      }
    } else {
      if (serialBufferIndex < sizeof(serialBuffer) - 1) {
        serialBuffer[serialBufferIndex++] = inChar;
      }
    }
  }
}

// Initialization
void setup() {
  Serial.begin(9600);

  for (byte i = 0; i < 4; i++) {
    pinMode(candidatePins[i], INPUT_PULLUP);
  }

  pinMode(resultButton, INPUT_PULLUP);
  pinMode(greenLED, OUTPUT);
  pinMode(redLED, OUTPUT);

  digitalWrite(greenLED, LOW);
  digitalWrite(redLED, LOW);

  lcd.init();
  lcd.backlight();

  loadElection();

  Serial.println(F("millis,event,candidate,A,B,C,D,total,closed,message"));
  logEvent("START", '-', "MachineReady");

  if (machineState == STATE_PUBLISHED) {
    digitalWrite(redLED, HIGH);
    digitalWrite(greenLED, LOW);
  } else if (machineState == STATE_VOTING) {
    digitalWrite(greenLED, HIGH);
    digitalWrite(redLED, LOW);
  } else {
    digitalWrite(greenLED, LOW);
    digitalWrite(redLED, LOW);
  }

  showWelcome();

  if (machineState == STATE_PUBLISHED) {
    showStatsPage();
  } else if (machineState == STATE_VOTING) {
    showReadyScreen();
  } else {
    showStandbyScreen();
  }
}

// Main Execution Loop
void loop() {
  handleSerialInput();

  if (!isPoweredOn) {
    if (updateButton(4, resultButton)) {
      if (stableState[4] == LOW) {
        resultButtonHeld = true;
        powerActionTriggered = false;
        resultPressStart = millis();
      } else {
        resultButtonHeld = false;
        powerActionTriggered = false;
      }
    }

    if (resultButtonHeld && !powerActionTriggered &&
        millis() - resultPressStart >= powerHoldTime) {
      powerActionTriggered = true;
      resultButtonHeld = false;
      powerOnMachine();
    }
    return;
  }

  // Candidate Buttons A, B, C
  for (byte i = 0; i < 3; i++) {
    if (updateButton(i, candidatePins[i]) && stableState[i] == LOW) {
      castVote(i);
    }
  }

  // Button Combo & Candidate D Handling
  bool dRaw = (digitalRead(candidatePins[3]) == LOW);
  bool rRaw = (digitalRead(resultButton) == LOW);

  if (dRaw && rRaw) {
    dPending = false;
    pin7Suppressed = true;

    if (!comboActive) {
      comboActive = true;
      comboHoldTriggered = false;
      comboPressStart = millis();
    } else {
      unsigned long heldDuration = millis() - comboPressStart;
      if (heldDuration >= 2000 && !comboHoldTriggered) {
        comboHoldTriggered = true;
        showMessage("HARDWARE SYNCING", "PLEASE WAIT...  ", 2500);
        logEvent("SYNC_REQUEST", isHardwareTestModeActive ? 'T' : 'V', "ComboHoldPin6And7");
      }
    }
  } else {
    if (comboActive) {
      unsigned long heldDuration = millis() - comboPressStart;
      comboActive = false;
      if (!comboHoldTriggered && heldDuration >= 60 && heldDuration < 2000) {
        isHardwareTestModeActive = !isHardwareTestModeActive;
        if (isHardwareTestModeActive) {
          showMessage(" MODE SWITCHED  ", " TEST MODE ON   ", 2500);
          logEvent("MODE_SWITCH", 'T', "ComboPin6And7");
        } else {
          showMessage(" MODE SWITCHED  ", " LIVE VOTING ON ", 2500);
          logEvent("MODE_SWITCH", 'V', "ComboPin6And7");
        }
      }
      comboHoldTriggered = false;
    } else {
      if (updateButton(3, candidatePins[3])) {
        if (stableState[3] == LOW) {
          dPending = true;
          dPendingTime = millis();
        } else {
          dPending = false;
        }
      }

      if (dPending && (millis() - dPendingTime >= comboWindow)) {
        dPending = false;
        if (!rRaw) {
          castVote(3);
        }
      }
    }
  }

  // Control Button Handling
  if (updateButton(4, resultButton)) {
    if (stableState[4] == LOW) {
      resultButtonHeld = true;
      resetTriggered = false;
      powerActionTriggered = false;
      resultPressStart = millis();
      pin7Suppressed = false;
    } else {
      if (pin7Suppressed) {
        pin7Suppressed = false;
        resultButtonHeld = false;
      } else if (resultButtonHeld && !powerActionTriggered) {
        unsigned long heldDuration = millis() - resultPressStart;

        if (heldDuration >= resetHoldTime && heldDuration < powerHoldTime) {
          resetTriggered = true;
          resetElection();
        } else if (heldDuration < resetHoldTime) {
          if (millis() - lastButtonActionTime >= actionCooldown) {
            if (machineState == STATE_STANDBY) {
              startVoting();
            } else if (machineState == STATE_VOTING) {
              if (!messageActive &&
                  (millis() - votingStartTime >= publishLockout)) {
                publishResults();
              }
            } else if (machineState == STATE_PUBLISHED) {
              if (!messageActive) {
                statsPage = (statsPage + 1) % 6;
                showStatsPage();
                lastButtonActionTime = millis();
                char pageCode = (statsPage == 0)   ? '0'
                                : (statsPage == 5) ? '5'
                                                   : ('0' + statsPage);
                logEvent("PAGE", pageCode, "StatsPageCycled");
              }
            }
          }
        }
      }
      resultButtonHeld = false;
      resetTriggered = false;
      powerActionTriggered = false;
    }
  }

  if (resultButtonHeld && !pin7Suppressed && !powerActionTriggered &&
      millis() - resultPressStart >= powerHoldTime) {
    powerActionTriggered = true;
    resultButtonHeld = false;
    powerOffMachine();
  }

  if (messageActive && (long)(millis() - messageUntil) >= 0) {
    if (machineState == STATE_PUBLISHED) {
      digitalWrite(greenLED, LOW);
      digitalWrite(redLED, HIGH);
      showStatsPage();
    } else if (machineState == STATE_VOTING) {
      digitalWrite(greenLED, HIGH);
      digitalWrite(redLED, LOW);
      showReadyScreen();
    } else {
      digitalWrite(greenLED, LOW);
      digitalWrite(redLED, LOW);
      showStandbyScreen();
    }
  }
}
