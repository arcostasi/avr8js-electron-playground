/*
  IR Receiver — NEC Decoder
  Receives NEC-protocol IR codes from the on-screen IR remote and prints
  the decoded command value to the Serial Monitor.
  Press buttons on the wokwi-ir-remote component to generate IR signals.

  Wiring:
    VCC -> 5V
    GND -> GND
    SIG -> Pin 7

  Library: IRremote by shirriff/z3t0 >= 4.0
*/

#include <IRremote.hpp>

const int IR_RECEIVE_PIN = 7; // IR receiver signal output

void setup() {
  Serial.begin(9600);
  IrReceiver.begin(IR_RECEIVE_PIN, ENABLE_LED_FEEDBACK);
  Serial.println("IR Receiver Demo — point the remote and press a button");
}

void loop() {
  if (IrReceiver.decode()) {
    // Only process complete, valid NEC frames (not repeats)
    if (IrReceiver.decodedIRData.protocol == NEC &&
        !(IrReceiver.decodedIRData.flags & IRDATA_FLAGS_IS_REPEAT)) {

      uint8_t cmd  = IrReceiver.decodedIRData.command;
      uint16_t addr = IrReceiver.decodedIRData.address;

      Serial.print("Address: 0x");
      Serial.print(addr, HEX);
      Serial.print("  Command: 0x");
      Serial.print(cmd, HEX);
      Serial.print("  (");
      Serial.print(cmd, DEC);
      Serial.println(")");
    }

    IrReceiver.resume(); // Ready to receive the next signal
  }
}
