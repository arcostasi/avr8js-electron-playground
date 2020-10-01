#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

float lovelace();

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("A0 + B1A1 + B3A3");
  lcd.setCursor(0, 1);
  lcd.print("   + B5A5: ");
  lcd.blink();
  lcd.print(bernoulli(4), 2);
  delay(1000);
}

/*
 * Calculates what Ada Lovelace labeled "B7",
 * which today we would call the 8th Bernoulli number.
 */
float bernoulli(float n)
{
    // ------------------------------------------------------------------------
    // Data
    // ------------------------------------------------------------------------
    float v1 = 1; // 1
    float v2 = 2; // 2
    float v3 = n; // n

    // ------------------------------------------------------------------------
    // Working Variables
    // ------------------------------------------------------------------------
    float v4 = 0;
    float v5 = 0;
    float v6 = 0;                        // Factors in the numerator
    float v7 = 0;                        // Factors in the denominator
    float v8 = 0;
    float v10 = 0;                       // Terms remaining count, basically
    float v11 = 0;                       // Accumulates v6 / v7
    float v12 = 0;                       // Stores most recent calculated term
    float v13 = 0;                       // Accumulates the whole result

    // ------------------------------------------------------------------------
    // Result Variables
    // ------------------------------------------------------------------------
    float v21 = 1.0f / 6.0f;             // B1
    float v22 = -1.0f / 30.0f;           // B3
    float v23 = 1.0f / 42.0f;            // B5
    float v24 = 0;                       // B7, not yet calculated

    // ------------------------------------------------------------------------
    // Calculation
    // ------------------------------------------------------------------------
    // ------- A0 -------
    /* 01 */ v4 = v5 = v6 = v2 * v3;      // 2n
    /* 02 */ v4 = v4 - v1;                // 2n - 1
    /* 03 */ v5 = v5 + v1;                // 2n + 1

    // In Lovelace's diagram, the below appears as v5 / v4, which is incorrect.
    /* 04 */ v11 = v4 / v5;               // (2n - 1) / (2n + 1)

    /* 05 */ v11 = v11 / v2;              // (1 / 2) * ((2n - 1) / (2n + 1))
    /* 06 */ v13 = v13 - v11;             // -(1 / 2) * ((2n - 1) / (2n + 1))
    /* 07 */ v10 = v3 - v1;               // (n - 1), set counter?

    // A0 = -(1 / 2) * ((2n - 1) / (2n + 1))

    // ------- B1A1 -------
    /* 08 */ v7 = v2 + v7;                // 2 + 0, basically a MOV instruction
    /* 09 */ v11 = v6 / v7;               // 2n / 2
    /* 10 */ v12 = v21 * v11;             // B1 * (2n / 2)

    // A1 = (2n / 2)
    // B1A1 = B1 * (2n / 2)

    // ------- A0 + B1A1 -------
    /* 11 */ v13 = v12 + v13;            // A0 + B1A1
    /* 12 */ v10 = v10 - v1;             // (n - 2)

    // On the first loop this calculates B3A3 and adds it on to v13.
    // On the second loop this calculates B5A5 and adds it on.
    while (v10 > 0)
    {
        // ------- B3A3, B5A5 -------
        while (v6 > 2 * v3 - (2 * (v3 - v10) - 2))
        {                                    // First Loop:
            /* 13 */ v6 = v6 - v1;           // 2n - 1
            /* 14 */ v7 = v1 + v7;           // 2 + 1
            /* 15 */ v8 = v6 / v7;           // (2n - 1) / 3
            /* 16 */ v11 = v8 * v11;         // (2n / 2) * ((2n - 1) / 3)

                                             // Second Loop:
            // 17    v6 = v6 - v1;              2n - 2
            // 18    v7 = v1 + v7;              3 + 1
            // 19    v8 = v6 / v7;              (2n - 2) / 4
            // 20    v11 = v8 * v11;            (2n / 2) * ((2n - 1) / 3) * ((2n - 2) / 4)
        }

        // A better way to do this might be to use an array for all of the
        // "Working Variables" and then index into it based on some calculated
        // index. Lovelace might have intended v14-v20 to be used on the
        // second iteration of this loop.
        //
        // Lovelace's program only has the version of the below line using v22
        // in the multiplication.
        if (v10 == 2)
        {
        /* 21 */ v12 = v22 * v11;            // B3 * A3
        }
        else
        {
        /* 21 */ v12 = v23 * v11;            // B5 * A5
        }

        // B3A3 = B3 * (2n / 2) * ((2n - 1) / 3) * ((2n - 2) / 4)

        // ------- A0 + B1A1 + B3A3, A0 + B1A1 + B3A3 + B5A5 -------
        /* 22 */ v13 = v12 + v13;            // A0 + B1A1 + B3A3 (+ B5A5)
        /* 23 */ v10 = v10 - v1;             // (n - 3), (n - 4)
    }

    /* 24 */ v24 = v13 + v24; // Store the final result in v24
    /* 25 */ v3 = v1 + v3;    // Move on to the next Bernoulli number!

    // This outputs a positive number, but really the answer should be
    // negative. There is some hand-waving in Lovelace's notes about the
    // Analytical Engine sorting out the proper sign.
    return v24;
}

void loop() {}
