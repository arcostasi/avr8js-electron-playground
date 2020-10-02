/*
 * Serial Port Echo with Arduino
 * Echoes what is sent back through the serial port.
 * http://spacetinkerer.blogspot.com
 */

int incomingByte = 0;  // For incoming serial data

void setup() {
  Serial.begin(9600);  // Opens serial port,
                       // sets data rate to 9600 bps
}

void loop() {
  // Send data only when you receive data:
  if (Serial.available() > 0) {
    // Read the incoming byte:
    incomingByte = Serial.read();
    // Say what you got:
    Serial.print((char)incomingByte);
  }
}
