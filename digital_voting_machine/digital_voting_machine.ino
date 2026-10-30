#include <EEPROM.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <ctype.h>
#include <string.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

// ==========================================
// Existing circuit: DO NOT change the wiring
// ==========================================
const byte candidatePins[4] = {3, 4, 5, 6};
const byte resultButton = 7;
const byte greenLED = 13;
const byte redLED = 12;

const char candidateNames[4] = {'A', 'B', 'C', 'D'};
byte activeCandidateCount =
    4; // Configurable: 2, 3, or 4 candidates (Min 2, Max 4)

const unsigned long debounceDelay = 40;
const unsigned long resetHoldTime = 3000;

// EEPROM storage
const uint32_t EEPROM_MAGIC = 0x564F5445UL; // "VOTE"

// 3 Distinct Machine States for Pin 7
enum MachineState : byte {
  STATE_STANDBY =
      0,            // Initial / after reset: "READY TO VOTE / Press D7 toStart"
  STATE_VOTING = 1, // After 1st click of D7: "VOTING STARTED" -> tallies
                    // displayed, votes accepted
  STATE_PUBLISHED = 2 // After 2nd click of D7: "RESULT PUBLISHED" -> winner
                      // displayed, voting closed
};

struct ElectionData {
  uint32_t magic;
  uint16_t votes[4];
  uint8_t state; // STATE_STANDBY, STATE_VOTING, or STATE_PUBLISHED
  uint16_t checksum;
};

uint16_t votes[4] = {0, 0, 0, 0};
MachineState machineState = STATE_STANDBY;

// Button debounce state
bool lastReading[5] = {HIGH, HIGH, HIGH, HIGH, HIGH};
bool stableState[5] = {HIGH, HIGH, HIGH, HIGH, HIGH};
unsigned long lastDebounceTime[5] = {0, 0, 0, 0, 0};

bool resultButtonHeld = false;
bool resetTriggered = false;
bool isPoweredOn = true;
bool powerActionTriggered = false;
unsigned long resultPressStart = 0;
unsigned long lastButtonActionTime = 0;
unsigned long votingStartTime = 0; // Timestamp when voting actively opened
const unsigned long actionCooldown =
    1000; // 1s cooldown between distinct D7 button releases
const unsigned long publishLockout =
    2500; // 2.5s lockout: prevents voting from immediately publishing on start
const unsigned long powerHoldTime =
    5000; // 5s continuous hold: Power OFF / Power ON

// LCD state
bool messageActive = false;
unsigned long messageUntil = 0;
byte statsPage = 5;

// Serial command buffer for 2-way Web Dashboard communication
char serialBuffer[32];
byte serialBufferIndex = 0;

// ---------- Forward Declarations ----------
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

// ---------- Basic helpers ----------

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

// ---------- EEPROM ----------

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

// ---------- Serial event logging ----------
// CSV columns:
// millis,event,candidate,A,B,C,D,total,closed,message

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

// ---------- LCD screens ----------

void showWelcome() {
  lcd.clear();
  lcd.setCursor(1, 0);
  lcd.print("DIGITAL VOTING");
  lcd.setCursor(0, 1);
  lcd.print("CITY UNIVERSITY ");
  delay(1200);
  lcd.clear();
}

void showStandbyScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TO START VOTING ");
  lcd.setCursor(0, 1);
  lcd.print("PRESS TO START  ");
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
  lcd.print("RESULT PUBLISHED");

  lcd.setCursor(0, 1);
  lcd.print("Voting is closed");

  messageActive = false;
}

// Statistics pages: 0 total, 1-4 candidates, 5 result / winner
void showStatsPage() {
  lcd.clear();

  uint32_t total = totalVotes();

  if (statsPage == 0) {
    lcd.setCursor(0, 0);
    lcd.print("TOTAL VOTES");

    lcd.setCursor(0, 1);
    lcd.print("Total: ");
    lcd.print(total);

  } else if (statsPage >= 1 && statsPage <= activeCandidateCount) {
    byte i = statsPage - 1;

    float percentage = total > 0 ? (votes[i] * 100.0f) / total : 0.0f;

    lcd.setCursor(0, 0);
    lcd.print("Candidate ");
    lcd.print(candidateNames[i]);

    lcd.setCursor(0, 1);
    lcd.print("Votes:");
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
      lcd.print("NO VOTES CAST   ");
      lcd.setCursor(0, 1);
      lcd.print("Total: 0        ");

    } else if (winnerCount > 1) {
      lcd.setCursor(0, 0);
      lcd.print("TIE - NO WINNER ");
      lcd.setCursor(0, 1);
      lcd.print("Top votes: ");
      lcd.print(highest);
      lcd.print("   ");

    } else {
      float winnerPct = (highest * 100.0f) / total;
      lcd.setCursor(0, 0);
      lcd.print("WINNER: Cand ");
      lcd.print(winner);
      lcd.print("  ");

      lcd.setCursor(0, 1);
      lcd.print("V:");
      lcd.print(highest);
      lcd.print(" (");
      char pctStr[6];
      dtostrf(winnerPct, 3, 0, pctStr);
      lcd.print(pctStr);
      lcd.print("%)   ");
    }
  }

  messageActive = false;
}

// ---------- 3 Sequential Tasks for Pin 7 ----------

// Task 1: 1st Click on Pin 7 starts voting session
void startVoting() {
  machineState = STATE_VOTING;
  lastButtonActionTime = millis();
  votingStartTime =
      millis(); // Record exact start time for publish lockout guard
  saveElection();

  digitalWrite(greenLED, HIGH); // Green LED is ON while voting is active!
  digitalWrite(redLED, LOW);

  logEvent("START", '7', "VotingStarted");

  // Show "VOTING STARTED" for 1.2 seconds before candidate tallies appear
  showMessage("VOTING STARTED", "Cast your vote!", 1200);
}

// ---------- Voting ----------

void castVote(byte candidate, bool isRemote) {
  // Guard 1: Must be started first via start click
  if (machineState == STATE_STANDBY) {
    digitalWrite(greenLED, LOW);
    digitalWrite(redLED, LOW);

    logEvent("VOTE_BLOCKED", candidateNames[candidate], "VotingNotStarted");

    showMessage("NOT STARTED", "Press to Start", 1500);
    return;
  }

  // Guard 2: If published, voting is closed
  if (machineState == STATE_PUBLISHED) {
    digitalWrite(greenLED, LOW);
    digitalWrite(redLED, HIGH);

    logEvent("VOTE_BLOCKED", candidateNames[candidate], "ResultPublished");

    showMessage("RESULT PUBLISHED", "Voting is closed", 1500);
    return;
  }

  // Guard 3: Reject votes if candidate slot is not active in this election
  // (e.g., only 2 members configured)
  if (candidate >= activeCandidateCount) {
    if (isRemote) {
      // Auto-expand candidate slots to accommodate live election candidate
      activeCandidateCount = candidate + 1;
      if (activeCandidateCount > 4)
        activeCandidateCount = 4;
    } else {
      digitalWrite(greenLED, LOW);
      digitalWrite(redLED, HIGH);

      logEvent("VOTE_BLOCKED", candidateNames[candidate],
               "CandidateSlotDisabled");

      char msg[17];
      snprintf(msg, sizeof(msg), "Only %d Active", activeCandidateCount);
      showMessage("  NO CANDIDATE  ", " SLOT DISABLED  ", 1500);

      digitalWrite(redLED, (machineState == STATE_PUBLISHED) ? HIGH : LOW);
      digitalWrite(greenLED, (machineState == STATE_VOTING) ? HIGH : LOW);
      return;
    }
  }

  // Prevent uint16_t vote counter overflow
  if (votes[candidate] == 65535) {
    showMessage("VOTE LIMIT", "Contact supervisor", 2000);
    logEvent("ERROR", candidateNames[candidate], "VoteLimit");
    return;
  }

  votes[candidate]++;

  // Save each accepted vote
  saveElection();

  // Green LED blinks to visually confirm vote recorded:
  digitalWrite(redLED, LOW);
  digitalWrite(greenLED, LOW);
  delay(120);
  digitalWrite(greenLED, HIGH);

  if (isRemote) {
    logEvent("REMOTE_VOTE", candidateNames[candidate], "RemoteVoteRecorded");
  } else {
    logEvent("VOTE", candidateNames[candidate], "VoteRecorded");
  }

  char line2[17];
  snprintf(line2, sizeof(line2), "Candidate %c", candidateNames[candidate]);

  showMessage("Vote Recorded", line2, 800);
}

// Task 2: 2nd Click on Pin 7 publishes results & closes voting
void publishResults() {
  machineState = STATE_PUBLISHED;
  lastButtonActionTime = millis();
  saveElection();

  digitalWrite(greenLED, LOW);
  digitalWrite(redLED, HIGH);

  statsPage = 5; // Default page 5 displays WINNER

  logEvent("RESULT", '7', "ResultsPublished");
  logStatistics();

  // Show "RESULT PUBLISHED" for 1.2s, then showStatsPage() displays the WINNER!
  showMessage("RESULT PUBLISHED", "Voting is closed", 1200);
}

// Task 3: 3-Second Hold on Pin 7 resets tallies & returns to Standby
void resetElection() {
  for (byte i = 0; i < 4; i++) {
    votes[i] = 0;
  }

  machineState = STATE_STANDBY; // Resets cleanly to standby
  lastButtonActionTime = millis();
  statsPage = 5;

  saveElection();

  digitalWrite(greenLED, LOW); // Both LEDs OFF in standby
  digitalWrite(redLED, LOW);

  logEvent("RESET", '7', "CountsResetPressToStart");

  // Show "VOTES RESET" for 1.5s, then screen restores to standby
  showMessage("VOTES RESET", "Press to Start", 1500);
}

// Task 4: 5-Second Hold on Pin 7 powers OFF (turns off LCD display, backlight &
// LEDs) When OFF, 5-Second Hold powers ON (restores display, backlight, LEDs &
// machine state)
void powerOffMachine() {
  isPoweredOn = false;
  saveElection();

  digitalWrite(greenLED, LOW);
  digitalWrite(redLED, LOW);

  lcd.clear();
  lcd.setCursor(1, 0);
  lcd.print("POWERING OFF...");
  delay(800);
  lcd.clear();
  lcd.noBacklight(); // Completely shut down the display backlight

  logEvent("POWER", '7', "PowerOff");
}

void powerOnMachine() {
  isPoweredOn = true;
  lastButtonActionTime = millis();

  lcd.backlight(); // Turn on display backlight
  lcd.clear();
  lcd.setCursor(1, 0);
  lcd.print("POWERING ON...");
  delay(1000);
  lcd.clear();

  logEvent("POWER", '7', "PowerOn");

  // Restore screen and LEDs
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

// ---------- Button debounce ----------

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

// ---------- 2-Way Serial Command Handler for Web Dashboard ----------
void processSerialCommand(const char *cmd) {
  // Trim spaces / newlines
  while (*cmd == ' ')
    cmd++;

  if (strcasecmp(cmd, "STATUS") == 0 || strcasecmp(cmd, "GET_STATUS") == 0) {
    logEvent("STATUS", '-', "StatusSync");
    logStatistics();
  } else if (strcasecmp(cmd, "PING") == 0) {
    logEvent("PONG", '-', "DeviceOnline");
  } else if (strncasecmp(cmd, "VOTE", 4) == 0 ||
             strncasecmp(cmd, "SIM_VOTE", 8) == 0) {
    // Format: VOTE:A, VOTE:B, VOTE A, SIM_VOTE:A, etc.
    const char *p = strchr(cmd, ':');
    if (!p)
      p = strchr(cmd, '=');
    if (!p)
      p = strchr(cmd, ' ');
    if (!p)
      p = strchr(cmd, '_');

    char slotChar = 0;
    if (p) {
      p++;
      while (*p == ' ')
        p++;
      slotChar = (char)toupper(*p);
    } else {
      size_t len = strlen(cmd);
      if (len > 4) {
        slotChar = (char)toupper(cmd[len - 1]);
      }
    }

    if (slotChar >= 'A' && slotChar <= 'D') {
      byte candIndex = slotChar - 'A';
      castVote(candIndex,
               true); // true = remote/simulated vote from Web Console
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
        if (p)
          p++;
      } else if (strncasecmp(p, "PUBLISHED", 9) == 0 ||
                 strncasecmp(p, "CLOSED", 6) == 0) {
        targetState = STATE_PUBLISHED;
        p = strchr(p, ':');
        if (p)
          p++;
      } else if (strncasecmp(p, "VOTING", 6) == 0 ||
                 strncasecmp(p, "LIVE", 4) == 0) {
        targetState = STATE_VOTING;
        p = strchr(p, ':');
        if (p)
          p++;
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
        showStandbyScreen();
      } else if (targetState == STATE_PUBLISHED) {
        machineState = STATE_PUBLISHED;
        digitalWrite(greenLED, LOW);
        digitalWrite(redLED, HIGH);
        statsPage = 5;
        showStatsPage();
      } else {
        machineState = STATE_VOTING;
        digitalWrite(greenLED, HIGH);
        digitalWrite(redLED, LOW);
        showReadyScreen();
      }
      lastButtonActionTime = millis();
      votingStartTime = millis();
      saveElection();
      logEvent("SYNC_OK",
               (machineState == STATE_STANDBY     ? 'S'
                : machineState == STATE_PUBLISHED ? 'P'
                                                  : 'V'),
               "StateSynced");
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
    if (!p)
      p = strchr(cmd, ':');
    if (p) {
      byte cnt = atoi(p + 1);
      if (cnt >= 2 && cnt <= 4) {
        activeCandidateCount = cnt;
        logEvent("CONFIG", '0' + activeCandidateCount,
                 "ActiveCandidateCountSet");
        if (machineState == STATE_VOTING)
          showReadyScreen();
      }
    }
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

// ---------- Setup ----------

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

  // CSV header for serial logger and website backend
  Serial.println("millis,event,candidate,A,B,C,D,total,closed,message");

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

  showWelcome(); // Slower smooth scrolling text (380ms delay)

  if (machineState == STATE_PUBLISHED) {
    showStatsPage();
  } else if (machineState == STATE_VOTING) {
    showReadyScreen();
  } else {
    showStandbyScreen();
  }
}

// ---------- Main loop ----------

void loop() {
  handleSerialInput();

  // If powered OFF: only listen for 5-second hold on Pin 7 to wake up and power
  // ON
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
    return; // Ignore candidate buttons and normal loop operations while powered
            // OFF
  }

  // Candidate buttons (Pins 3, 4, 5, 6)
  for (byte i = 0; i < 4; i++) {
    if (updateButton(i, candidatePins[i]) && stableState[i] == LOW) {
      castVote(i);
    }
  }

  // Result button (Pin 7) actions:
  // - Short Click (< 3s): Start (in Standby), Publish (in Voting), Stats Cycle
  // (in Published)
  // - 3s Hold & Release (between 3s and 5s): Reset tallies & return to Standby
  // - 5s Continuous Hold: Power OFF (clears display, turns off LCD backlight &
  // LEDs)
  if (updateButton(4, resultButton)) {
    if (stableState[4] == LOW) {
      // Button was pressed down
      resultButtonHeld = true;
      resetTriggered = false;
      powerActionTriggered = false;
      resultPressStart = millis();
    } else {
      // Button was released
      if (resultButtonHeld && !powerActionTriggered) {
        unsigned long heldDuration = millis() - resultPressStart;

        if (heldDuration >= resetHoldTime && heldDuration < powerHoldTime) {
          // Releasing between 3s and 5s triggers RESET
          resetTriggered = true;
          resetElection();
        } else if (heldDuration < resetHoldTime) {
          // Short click (< 3s)
          if (millis() - lastButtonActionTime >= actionCooldown) {
            if (machineState == STATE_STANDBY) {
              // Action 1: 1st Click starts voting!
              startVoting();
            } else if (machineState == STATE_VOTING) {
              // Action 2: 2nd Click publishes results!
              // Guard: ensure voting has been active for at least
              // publishLockout (2.5s) AND ensure the transition screen message
              // "VOTING STARTED" is finished
              if (!messageActive &&
                  (millis() - votingStartTime >= publishLockout)) {
                publishResults();
              }
            } else if (machineState == STATE_PUBLISHED) {
              // Subsequent clicks cycle through statistics pages
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

  // Trigger Power OFF when held continuously for 5 seconds
  if (resultButtonHeld && !powerActionTriggered &&
      millis() - resultPressStart >= powerHoldTime) {
    powerActionTriggered = true;
    resultButtonHeld = false;
    powerOffMachine();
  }

  // Restore the appropriate screen after temporary messages
  if (messageActive && (long)(millis() - messageUntil) >= 0) {
    if (machineState == STATE_PUBLISHED) {
      digitalWrite(greenLED, LOW);
      digitalWrite(redLED, HIGH);
      showStatsPage(); // Displays the WINNER screen!
    } else if (machineState == STATE_VOTING) {
      digitalWrite(greenLED, HIGH);
      digitalWrite(redLED, LOW);
      showReadyScreen();
    } else {
      digitalWrite(greenLED, LOW);
      digitalWrite(redLED, LOW);
      showStandbyScreen(); // Shows "TO START VOTING / PRESS TO START"
    }
  }
}
