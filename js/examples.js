class Examples {

  path() {
    return './examples/';
  }

  blinks() {
    readTextFile(this.path() + 'blinks/blinks.ino');
  }

  rgb() {
    readTextFile(this.path() + 'rgb/rgb.ino');
  }

  fire() {
    readTextFile(this.path() + 'fire/fire.ino');
  }

  metalballs() {
    readTextFile(this.path() + 'metaballs/metaballs.ino');
  }

  display() {
    readTextFile(this.path() + 'display/display.ino');
  }

  ssd1306() {
    readTextFile(this.path() + 'ssd1306/ssd1306.ino');
  }

  dht22() {
    readTextFile(this.path() + 'dht22/dht22.ino');
  }

}

let examples = new Examples;

document.addEventListener('DOMContentLoaded', (event) => {
  // Create tab examples
  createTab("blinks", "examples.blinks()");
  createTab("rgb", "examples.rgb()");
  createTab("fire", "examples.fire()");
  createTab("metalballs", "examples.metalballs()");
  createTab("display", "examples.display()");
  createTab("ssd1306", "examples.ssd1306()");
  createTab("dht22", "examples.dht22()");

  // Load blink example
  examples.blinks();
});
