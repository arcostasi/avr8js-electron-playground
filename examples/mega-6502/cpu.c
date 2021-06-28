/**
 * 6502 CPU emulator.
 * Copyright (C) 2011, Mike Chambers
 *****************************************************
 * LICENSE: This source code is released into the    *
 * public domain, but if you use it please do give   *
 * credit. I put a lot of effort into writing this!  *
 *****************************************************
 */
#include <stdint.h>
#include <avr/pgmspace.h>

extern void serout(uint8_t value);

#define NULL (void *) 0

// #define RAM_SIZE 1536
#define RAM_SIZE 16384

// 6502 defines
#define UNDOCUMENTED // When this is defined, undocumented opcodes are handled.
// otherwise, they're simply treated as NOPs.

// #define USE_TIMING // Slower, but allows you to specify number of
// cycles to run for exec6502 rather than simply a number of instructions.
// also uses a little more program memory when enabled.

#define FLAG_CARRY     0x01
#define FLAG_ZERO      0x02
#define FLAG_INTERRUPT 0x04
#define FLAG_DECIMAL   0x08
#define FLAG_BREAK     0x10
#define FLAG_CONSTANT  0x20
#define FLAG_OVERFLOW  0x40
#define FLAG_SIGN      0x80

#define BASE_STACK     0x100

#define saveaccum(n) a = (uint8_t)((n) & 0x00FF)

// Flag modifier macros
#define setcarry() cpustatus |= FLAG_CARRY
#define clearcarry() cpustatus &= (~FLAG_CARRY)
#define setzero() cpustatus |= FLAG_ZERO
#define clearzero() cpustatus &= (~FLAG_ZERO)
#define setinterrupt() cpustatus |= FLAG_INTERRUPT
#define clearinterrupt() cpustatus &= (~FLAG_INTERRUPT)
#define setdecimal() cpustatus |= FLAG_DECIMAL
#define cleardecimal() cpustatus &= (~FLAG_DECIMAL)
#define setoverflow() cpustatus |= FLAG_OVERFLOW
#define clearoverflow() cpustatus &= (~FLAG_OVERFLOW)
#define setsign() cpustatus |= FLAG_SIGN
#define clearsign() cpustatus &= (~FLAG_SIGN)

// Flag calculation macros
#define zerocalc(n) { if ((n) & 0x00FF) clearzero(); else setzero(); }

#define signcalc(n) { if ((n) & 0x0080) setsign(); else clearsign(); }

#define carrycalc(n) { if ((n) & 0xFF00) setcarry(); else clearcarry(); }

#define overflowcalc(n, m, o) { if (((n) ^ (uint16_t)(m)) & ((n) ^ (o)) & 0x0080) setoverflow(); else clearoverflow(); }

// 6502 CPU registers
uint16_t pc;
uint8_t sp, a, x, y, cpustatus;

// Helper variables
uint32_t instructions = 0; // Keep track of total instructions executed
int32_t clockticks6502 = 0, clockgoal6502 = 0;
uint16_t oldpc, ea, reladdr, value, result;
uint8_t opcode, oldcpustatus, useaccum;

uint8_t RAM[RAM_SIZE];

#include "rom.h"

const char BIOStop[256] PROGMEM = {
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xD8, 0xA2, 0xFF, 0x9A,
    0xA0, 0x1C, 0xB9, 0xBB, 0xFF, 0x99, 0x04, 0x02, 0x88, 0xD0, 0xF7,
    0xB9, 0xD8, 0xFF, 0xF0, 0x06, 0x20, 0xED, 0xE0, 0xC8, 0xD0, 0xF5,
    0x20, 0xEA, 0xE0, 0x90, 0xFB, 0x29, 0xDF, 0xC9, 0x57, 0xF0, 0x07,
    0xC9, 0x43, 0xD0, 0xD7, 0x4C, 0x00, 0xC0, 0x4C, 0x00, 0x00, 0x8D,
    0x01, 0xF0, 0x60, 0xAD, 0x04, 0xF0, 0xF0, 0x02, 0x38, 0x60, 0x18,
    0x60, 0xB3, 0xFF, 0xAF, 0xFF, 0xBB, 0xFF, 0xBB, 0xFF, 0x48, 0xA5,
    0xDF, 0x4A, 0x05, 0xDF, 0x85, 0xDF, 0x68, 0x40, 0x48, 0xA5, 0xDC,
    0x4A, 0x05, 0xDC, 0x85, 0xDC, 0x68, 0x40, 0x0D, 0x0A, 0x36, 0x35,
    0x30, 0x32, 0x20, 0x45, 0x68, 0x42, 0x41, 0x53, 0x49, 0x43, 0x20,
    0x5B, 0x43, 0x5D, 0x6F, 0x6C, 0x64, 0x2F, 0x5B, 0x57, 0x5D, 0x61,
    0x72, 0x6D, 0x20, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x17, 0x02, 0x80,
    0xFF, 0x0D, 0x02
};

static uint8_t read6502(uint16_t address) {
    uint16_t BIOSaddr;

    if (address == 0xF004) { // EhBASIC simulated ASIC input
        return getkey();
    }

    if (address >= 0xC000) {
        BIOSaddr = address - 0xC000;
        if (BIOSaddr < sizeof BIOS)
            return (pgm_read_byte_near(BIOS + BIOSaddr));
        if (BIOSaddr >= 0x3F00)
            return (pgm_read_byte_near(BIOStop + BIOSaddr - 0x3F00));
    }

    if (address < RAM_SIZE) return (RAM[address]);
    return (0);
}

static void write6502(uint16_t address, uint8_t value) {
    if (address < RAM_SIZE) RAM[address] = value;
    if (address == 0xF001) { // EhBASIC simulated ASIC output
        serout(value);
    }
}

// A few general functions used by various other functions
static void push16(uint16_t pushval) {
    write6502(BASE_STACK + sp, (pushval >> 8) & 0xFF);
    write6502(BASE_STACK + ((sp - 1) & 0xFF), pushval & 0xFF);
    sp -= 2;
}

static void push8(uint8_t pushval) {
    write6502(BASE_STACK + sp--, pushval);
}

static uint16_t pull16() {
    uint16_t temp16;
    temp16 = read6502(BASE_STACK + ((sp + 1) & 0xFF)) | ((uint16_t)read6502(BASE_STACK + ((sp + 2) & 0xFF)) << 8);
    sp += 2;
    return (temp16);
}

static uint8_t pull8() {
    return (read6502(BASE_STACK + ++sp));
}

int reset6502() {
    pc = (uint16_t)read6502(0xFFFC) | ((uint16_t)read6502(0xFFFD) << 8);
    a = 0;
    x = 0;
    y = 0;
    sp = 0xFD;
    cpustatus |= FLAG_CONSTANT;
    return sizeof BIOS;
}

// Addressing mode functions, calculates effective addresses
static void imp() { // implied
}

static void acc() { // accumulator
    useaccum = 1;
}

static void imm() { // immediate
    ea = pc++;
}

static void zp() { // zero-page
    ea = (uint16_t)read6502((uint16_t)pc++);
}

static void zpx() { // zero-page,X
    ea = ((uint16_t)read6502((uint16_t)pc++) + (uint16_t)x) & 0xFF; // zero-page wraparound
}

static void zpy() { // zero-page,Y
    ea = ((uint16_t)read6502((uint16_t)pc++) + (uint16_t)y) & 0xFF; // zero-page wraparound
}

static void rel() { // relative for branch ops (8-bit immediate value, sign-extended)
    reladdr = (uint16_t)read6502(pc++);
    if (reladdr & 0x80) reladdr |= 0xFF00;
}

static void abso() { // absolute
    ea = (uint16_t)read6502(pc) | ((uint16_t)read6502(pc + 1) << 8);
    pc += 2;
}

static void absx() { // absolute,X
    uint16_t startpage;
    ea = ((uint16_t)read6502(pc) | ((uint16_t)read6502(pc + 1) << 8));
    startpage = ea & 0xFF00;
    ea += (uint16_t)x;

    pc += 2;
}

static void absy() { // absolute,Y
    uint16_t startpage;
    ea = ((uint16_t)read6502(pc) | ((uint16_t)read6502(pc + 1) << 8));
    startpage = ea & 0xFF00;
    ea += (uint16_t)y;

    pc += 2;
}

static void ind() { // indirect
    uint16_t eahelp, eahelp2;
    eahelp = (uint16_t)read6502(pc) | (uint16_t)((uint16_t)read6502(pc + 1) << 8);
    eahelp2 = (eahelp & 0xFF00) | ((eahelp + 1) & 0x00FF); // replicate 6502 page-boundary wraparound bug
    ea = (uint16_t)read6502(eahelp) | ((uint16_t)read6502(eahelp2) << 8);
    pc += 2;
}

static void indx() { // (indirect,X)
    uint16_t eahelp;
    eahelp = (uint16_t)(((uint16_t)read6502(pc++) + (uint16_t)x) & 0xFF); // zero-page wraparound for table pointer
    ea = (uint16_t)read6502(eahelp & 0x00FF) | ((uint16_t)read6502((eahelp + 1) & 0x00FF) << 8);
}

static void indy() { // (indirect),Y
    uint16_t eahelp, eahelp2, startpage;
    eahelp = (uint16_t)read6502(pc++);
    eahelp2 = (eahelp & 0xFF00) | ((eahelp + 1) & 0x00FF); // zero-page wraparound
    ea = (uint16_t)read6502(eahelp) | ((uint16_t)read6502(eahelp2) << 8);
    startpage = ea & 0xFF00;
    ea += (uint16_t)y;

}

static uint16_t getvalue() {
    if (useaccum) return ((uint16_t)a);
    else return ((uint16_t)read6502(ea));
}

static uint16_t getvalue16() {
    return ((uint16_t)read6502(ea) | ((uint16_t)read6502(ea + 1) << 8));
}

static void putvalue(uint16_t saveval) {
    if (useaccum) a = (uint8_t)(saveval & 0x00FF);
    else write6502(ea, (saveval & 0x00FF));
}

// Instruction handler functions
static void adc() {
    value = getvalue();
    result = (uint16_t)a + value + (uint16_t)(cpustatus & FLAG_CARRY);

    carrycalc(result);
    zerocalc(result);
    overflowcalc(result, a, value);
    signcalc(result);

#ifndef NES_CPU
    if (cpustatus & FLAG_DECIMAL) {
        clearcarry();

        if ((a & 0x0F) > 0x09) {
            a += 0x06;
        }
        if ((a & 0xF0) > 0x90) {
            a += 0x60;
            setcarry();
        }

        clockticks6502++;
    }
#endif

    saveaccum(result);
}

static void op_and() {
    value = getvalue();
    result = (uint16_t)a & value;

    zerocalc(result);
    signcalc(result);

    saveaccum(result);
}

static void asl() {
    value = getvalue();
    result = value << 1;

    carrycalc(result);
    zerocalc(result);
    signcalc(result);

    putvalue(result);
}

static void bcc() {
    if ((cpustatus & FLAG_CARRY) == 0) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void bcs() {
    if ((cpustatus & FLAG_CARRY) == FLAG_CARRY) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void beq() {
    if ((cpustatus & FLAG_ZERO) == FLAG_ZERO) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void op_bit() {
    value = getvalue();
    result = (uint16_t)a & value;

    zerocalc(result);
    cpustatus = (cpustatus & 0x3F) | (uint8_t)(value & 0xC0);
}

static void bmi() {
    if ((cpustatus & FLAG_SIGN) == FLAG_SIGN) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void bne() {
    if ((cpustatus & FLAG_ZERO) == 0) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void bpl() {
    if ((cpustatus & FLAG_SIGN) == 0) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void brk() {
    pc++;
    push16(pc); // Push next instruction address onto stack
    push8(cpustatus | FLAG_BREAK); // Push CPU cpustatus to stack
    setinterrupt(); // Set interrupt flag
    pc = (uint16_t)read6502(0xFFFE) | ((uint16_t)read6502(0xFFFF) << 8);
}

static void bvc() {
    if ((cpustatus & FLAG_OVERFLOW) == 0) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // Check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void bvs() {
    if ((cpustatus & FLAG_OVERFLOW) == FLAG_OVERFLOW) {
        oldpc = pc;
        pc += reladdr;
        if ((oldpc & 0xFF00) != (pc & 0xFF00)) clockticks6502 += 2; // Check if jump crossed a page boundary
        else clockticks6502++;
    }
}

static void clc() {
    clearcarry();
}

static void cld() {
    cleardecimal();
}

static void cli() {
    clearinterrupt();
}

static void clv() {
    clearoverflow();
}

static void cmp() {
    value = getvalue();
    result = (uint16_t)a - value;

    if (a >= (uint8_t)(value & 0x00FF)) setcarry();
    else clearcarry();
    if (a == (uint8_t)(value & 0x00FF)) setzero();
    else clearzero();
    signcalc(result);
}

static void cpx() {
    value = getvalue();
    result = (uint16_t)x - value;

    if (x >= (uint8_t)(value & 0x00FF)) setcarry();
    else clearcarry();
    if (x == (uint8_t)(value & 0x00FF)) setzero();
    else clearzero();
    signcalc(result);
}

static void cpy() {
    value = getvalue();
    result = (uint16_t)y - value;

    if (y >= (uint8_t)(value & 0x00FF)) setcarry();
    else clearcarry();
    if (y == (uint8_t)(value & 0x00FF)) setzero();
    else clearzero();
    signcalc(result);
}

static void dec() {
    value = getvalue();
    result = value - 1;

    zerocalc(result);
    signcalc(result);

    putvalue(result);
}

static void dex() {
    x--;

    zerocalc(x);
    signcalc(x);
}

static void dey() {
    y--;

    zerocalc(y);
    signcalc(y);
}

static void eor() {
    value = getvalue();
    result = (uint16_t)a ^ value;

    zerocalc(result);
    signcalc(result);

    saveaccum(result);
}

static void inc() {
    value = getvalue();
    result = value + 1;

    zerocalc(result);
    signcalc(result);

    putvalue(result);
}

static void inx() {
    x++;

    zerocalc(x);
    signcalc(x);
}

static void iny() {
    y++;

    zerocalc(y);
    signcalc(y);
}

static void jmp() {
    pc = ea;
}

static void jsr() {
    push16(pc - 1);
    pc = ea;
}

static void lda() {
    value = getvalue();
    a = (uint8_t)(value & 0x00FF);

    zerocalc(a);
    signcalc(a);
}

static void ldx() {
    value = getvalue();
    x = (uint8_t)(value & 0x00FF);

    zerocalc(x);
    signcalc(x);
}

static void ldy() {
    value = getvalue();
    y = (uint8_t)(value & 0x00FF);

    zerocalc(y);
    signcalc(y);
}

static void lsr() {
    value = getvalue();
    result = value >> 1;

    if (value & 1) setcarry();
    else clearcarry();
    zerocalc(result);
    signcalc(result);

    putvalue(result);
}

static void nop() {
}

static void ora() {
    value = getvalue();
    result = (uint16_t)a | value;

    zerocalc(result);
    signcalc(result);

    saveaccum(result);
}

static void pha() {
    push8(a);
}

static void php() {
    push8(cpustatus | FLAG_BREAK);
}

static void pla() {
    a = pull8();

    zerocalc(a);
    signcalc(a);
}

static void plp() {
    cpustatus = pull8() | FLAG_CONSTANT;
}

static void rol() {
    value = getvalue();
    result = (value << 1) | (cpustatus & FLAG_CARRY);

    carrycalc(result);
    zerocalc(result);
    signcalc(result);

    putvalue(result);
}

static void ror() {
    value = getvalue();
    result = (value >> 1) | ((cpustatus & FLAG_CARRY) << 7);

    if (value & 1) setcarry();
    else clearcarry();
    zerocalc(result);
    signcalc(result);

    putvalue(result);
}

static void rti() {
    cpustatus = pull8();
    value = pull16();
    pc = value;
}

static void rts() {
    value = pull16();
    pc = value + 1;
}

static void sbc() {
    value = getvalue() ^ 0x00FF;
    result = (uint16_t)a + value + (uint16_t)(cpustatus & FLAG_CARRY);

    carrycalc(result);
    zerocalc(result);
    overflowcalc(result, a, value);
    signcalc(result);

#ifndef NES_CPU
    if (cpustatus & FLAG_DECIMAL) {
        clearcarry();

        a -= 0x66;
        if ((a & 0x0F) > 0x09) {
            a += 0x06;
        }
        if ((a & 0xF0) > 0x90) {
            a += 0x60;
            setcarry();
        }

        clockticks6502++;
    }
#endif

    saveaccum(result);
}

static void sec() {
    setcarry();
}

static void sed() {
    setdecimal();
}

static void sei() {
    setinterrupt();
}

static void sta() {
    putvalue(a);
}

static void stx() {
    putvalue(x);
}

static void sty() {
    putvalue(y);
}

static void tax() {
    x = a;

    zerocalc(x);
    signcalc(x);
}

static void tay() {
    y = a;

    zerocalc(y);
    signcalc(y);
}

static void tsx() {
    x = sp;

    zerocalc(x);
    signcalc(x);
}

static void txa() {
    a = x;

    zerocalc(a);
    signcalc(a);
}

static void txs() {
    sp = x;
}

static void tya() {
    a = y;

    zerocalc(a);
    signcalc(a);
}

// Undocumented instructions
#ifdef UNDOCUMENTED
static void lax() {
    lda();
    ldx();
}

static void sax() {
    sta();
    stx();
    putvalue(a & x);
}

static void dcp() {
    dec();
    cmp();
}

static void isb() {
    inc();
    sbc();
}

static void slo() {
    asl();
    ora();
}

static void rla() {
    rol();
    op_and();
}

static void sre() {
    lsr();
    eor();
}

static void rra() {
    ror();
    adc();
}
#else
#define lax nop
#define sax nop
#define dcp nop
#define isb nop
#define slo nop
#define rla nop
#define sre nop
#define rra nop
#endif

static void nmi6502() {
    push16(pc);
    push8(cpustatus);
    cpustatus |= FLAG_INTERRUPT;
    pc = (uint16_t)read6502(0xFFFA) | ((uint16_t)read6502(0xFFFB) << 8);
}

static void irq6502() {
    push16(pc);
    push8(cpustatus);
    cpustatus |= FLAG_INTERRUPT;
    pc = (uint16_t)read6502(0xFFFE) | ((uint16_t)read6502(0xFFFF) << 8);
}

#ifdef USE_TIMING
const prog_char ticktable[256] PROGMEM = {
    /*        |  0  |  1  |  2  |  3  |  4  |  5  |  6  |  7  |  8  |  9  |  A  |  B  |  C  |  D  |  E  |  F  |     */
    /* 0 */      7,    6,    2,    8,    3,    3,    5,    5,    3,    2,    2,    2,    4,    4,    6,    6,  /* 0 */
    /* 1 */      2,    5,    2,    8,    4,    4,    6,    6,    2,    4,    2,    7,    4,    4,    7,    7,  /* 1 */
    /* 2 */      6,    6,    2,    8,    3,    3,    5,    5,    4,    2,    2,    2,    4,    4,    6,    6,  /* 2 */
    /* 3 */      2,    5,    2,    8,    4,    4,    6,    6,    2,    4,    2,    7,    4,    4,    7,    7,  /* 3 */
    /* 4 */      6,    6,    2,    8,    3,    3,    5,    5,    3,    2,    2,    2,    3,    4,    6,    6,  /* 4 */
    /* 5 */      2,    5,    2,    8,    4,    4,    6,    6,    2,    4,    2,    7,    4,    4,    7,    7,  /* 5 */
    /* 6 */      6,    6,    2,    8,    3,    3,    5,    5,    4,    2,    2,    2,    5,    4,    6,    6,  /* 6 */
    /* 7 */      2,    5,    2,    8,    4,    4,    6,    6,    2,    4,    2,    7,    4,    4,    7,    7,  /* 7 */
    /* 8 */      2,    6,    2,    6,    3,    3,    3,    3,    2,    2,    2,    2,    4,    4,    4,    4,  /* 8 */
    /* 9 */      2,    6,    2,    6,    4,    4,    4,    4,    2,    5,    2,    5,    5,    5,    5,    5,  /* 9 */
    /* A */      2,    6,    2,    6,    3,    3,    3,    3,    2,    2,    2,    2,    4,    4,    4,    4,  /* A */
    /* B */      2,    5,    2,    5,    4,    4,    4,    4,    2,    4,    2,    4,    4,    4,    4,    4,  /* B */
    /* C */      2,    6,    2,    8,    3,    3,    5,    5,    2,    2,    2,    2,    4,    4,    6,    6,  /* C */
    /* D */      2,    5,    2,    8,    4,    4,    6,    6,    2,    4,    2,    7,    4,    4,    7,    7,  /* D */
    /* E */      2,    6,    2,    8,    3,    3,    5,    5,    2,    2,    2,    2,    4,    4,    6,    6,  /* E */
    /* F */      2,    5,    2,    8,    4,    4,    6,    6,    2,    4,    2,    7,    4,    4,    7,    7   /* F */
};
#endif

void exec6502(int32_t tickcount) {
#ifdef USE_TIMING
    clockgoal6502 += tickcount;

    while (clockgoal6502 > 0)
#else
    while (tickcount--)
#endif
    {
        opcode = read6502(pc++);
        cpustatus |= FLAG_CONSTANT;

        useaccum = 0;

        switch (opcode) {
        case 0x0:
            imp();
            brk();
            break;
        case 0x1:
            indx();
            ora();
            break;
        case 0x5:
            zp();
            ora();
            break;
        case 0x6:
            zp();
            asl();
            break;
        case 0x8:
            imp();
            php();
            break;
        case 0x9:
            imm();
            ora();
            break;
        case 0xA:
            acc();
            asl();
            break;
        case 0xD:
            abso();
            ora();
            break;
        case 0xE:
            abso();
            asl();
            break;
        case 0x10:
            rel();
            bpl();
            break;
        case 0x11:
            indy();
            ora();
            break;
        case 0x15:
            zpx();
            ora();
            break;
        case 0x16:
            zpx();
            asl();
            break;
        case 0x18:
            imp();
            clc();
            break;
        case 0x19:
            absy();
            ora();
            break;
        case 0x1D:
            absx();
            ora();
            break;
        case 0x1E:
            absx();
            asl();
            break;
        case 0x20:
            abso();
            jsr();
            break;
        case 0x21:
            indx();
            op_and();
            break;
        case 0x24:
            zp();
            op_bit();
            break;
        case 0x25:
            zp();
            op_and();
            break;
        case 0x26:
            zp();
            rol();
            break;
        case 0x28:
            imp();
            plp();
            break;
        case 0x29:
            imm();
            op_and();
            break;
        case 0x2A:
            acc();
            rol();
            break;
        case 0x2C:
            abso();
            op_bit();
            break;
        case 0x2D:
            abso();
            op_and();
            break;
        case 0x2E:
            abso();
            rol();
            break;
        case 0x30:
            rel();
            bmi();
            break;
        case 0x31:
            indy();
            op_and();
            break;
        case 0x35:
            zpx();
            op_and();
            break;
        case 0x36:
            zpx();
            rol();
            break;
        case 0x38:
            imp();
            sec();
            break;
        case 0x39:
            absy();
            op_and();
            break;
        case 0x3D:
            absx();
            op_and();
            break;
        case 0x3E:
            absx();
            rol();
            break;
        case 0x40:
            imp();
            rti();
            break;
        case 0x41:
            indx();
            eor();
            break;
        case 0x45:
            zp();
            eor();
            break;
        case 0x46:
            zp();
            lsr();
            break;
        case 0x48:
            imp();
            pha();
            break;
        case 0x49:
            imm();
            eor();
            break;
        case 0x4A:
            acc();
            lsr();
            break;
        case 0x4C:
            abso();
            jmp();
            break;
        case 0x4D:
            abso();
            eor();
            break;
        case 0x4E:
            abso();
            lsr();
            break;
        case 0x50:
            rel();
            bvc();
            break;
        case 0x51:
            indy();
            eor();
            break;
        case 0x55:
            zpx();
            eor();
            break;
        case 0x56:
            zpx();
            lsr();
            break;
        case 0x58:
            imp();
            cli();
            break;
        case 0x59:
            absy();
            eor();
            break;
        case 0x5D:
            absx();
            eor();
            break;
        case 0x5E:
            absx();
            lsr();
            break;
        case 0x60:
            imp();
            rts();
            break;
        case 0x61:
            indx();
            adc();
            break;
        case 0x65:
            zp();
            adc();
            break;
        case 0x66:
            zp();
            ror();
            break;
        case 0x68:
            imp();
            pla();
            break;
        case 0x69:
            imm();
            adc();
            break;
        case 0x6A:
            acc();
            ror();
            break;
        case 0x6C:
            ind();
            jmp();
            break;
        case 0x6D:
            abso();
            adc();
            break;
        case 0x6E:
            abso();
            ror();
            break;
        case 0x70:
            rel();
            bvs();
            break;
        case 0x71:
            indy();
            adc();
            break;
        case 0x75:
            zpx();
            adc();
            break;
        case 0x76:
            zpx();
            ror();
            break;
        case 0x78:
            imp();
            sei();
            break;
        case 0x79:
            absy();
            adc();
            break;
        case 0x7D:
            absx();
            adc();
            break;
        case 0x7E:
            absx();
            ror();
            break;
        case 0x81:
            indx();
            sta();
            break;
        case 0x84:
            zp();
            sty();
            break;
        case 0x85:
            zp();
            sta();
            break;
        case 0x86:
            zp();
            stx();
            break;
        case 0x88:
            imp();
            dey();
            break;
        case 0x8A:
            imp();
            txa();
            break;
        case 0x8C:
            abso();
            sty();
            break;
        case 0x8D:
            abso();
            sta();
            break;
        case 0x8E:
            abso();
            stx();
            break;
        case 0x90:
            rel();
            bcc();
            break;
        case 0x91:
            indy();
            sta();
            break;
        case 0x94:
            zpx();
            sty();
            break;
        case 0x95:
            zpx();
            sta();
            break;
        case 0x96:
            zpy();
            stx();
            break;
        case 0x98:
            imp();
            tya();
            break;
        case 0x99:
            absy();
            sta();
            break;
        case 0x9A:
            imp();
            txs();
            break;
        case 0x9D:
            absx();
            sta();
            break;
        case 0xA0:
            imm();
            ldy();
            break;
        case 0xA1:
            indx();
            lda();
            break;
        case 0xA2:
            imm();
            ldx();
            break;
        case 0xA4:
            zp();
            ldy();
            break;
        case 0xA5:
            zp();
            lda();
            break;
        case 0xA6:
            zp();
            ldx();
            break;
        case 0xA8:
            imp();
            tay();
            break;
        case 0xA9:
            imm();
            lda();
            break;
        case 0xAA:
            imp();
            tax();
            break;
        case 0xAC:
            abso();
            ldy();
            break;
        case 0xAD:
            abso();
            lda();
            break;
        case 0xAE:
            abso();
            ldx();
            break;
        case 0xB0:
            rel();
            bcs();
            break;
        case 0xB1:
            indy();
            lda();
            break;
        case 0xB4:
            zpx();
            ldy();
            break;
        case 0xB5:
            zpx();
            lda();
            break;
        case 0xB6:
            zpy();
            ldx();
            break;
        case 0xB8:
            imp();
            clv();
            break;
        case 0xB9:
            absy();
            lda();
            break;
        case 0xBA:
            imp();
            tsx();
            break;
        case 0xBC:
            absx();
            ldy();
            break;
        case 0xBD:
            absx();
            lda();
            break;
        case 0xBE:
            absy();
            ldx();
            break;
        case 0xC0:
            imm();
            cpy();
            break;
        case 0xC1:
            indx();
            cmp();
            break;
        case 0xC4:
            zp();
            cpy();
            break;
        case 0xC5:
            zp();
            cmp();
            break;
        case 0xC6:
            zp();
            dec();
            break;
        case 0xC8:
            imp();
            iny();
            break;
        case 0xC9:
            imm();
            cmp();
            break;
        case 0xCA:
            imp();
            dex();
            break;
        case 0xCC:
            abso();
            cpy();
            break;
        case 0xCD:
            abso();
            cmp();
            break;
        case 0xCE:
            abso();
            dec();
            break;
        case 0xD0:
            rel();
            bne();
            break;
        case 0xD1:
            indy();
            cmp();
            break;
        case 0xD5:
            zpx();
            cmp();
            break;
        case 0xD6:
            zpx();
            dec();
            break;
        case 0xD8:
            imp();
            cld();
            break;
        case 0xD9:
            absy();
            cmp();
            break;
        case 0xDD:
            absx();
            cmp();
            break;
        case 0xDE:
            absx();
            dec();
            break;
        case 0xE0:
            imm();
            cpx();
            break;
        case 0xE1:
            indx();
            sbc();
            break;
        case 0xE4:
            zp();
            cpx();
            break;
        case 0xE5:
            zp();
            sbc();
            break;
        case 0xE6:
            zp();
            inc();
            break;
        case 0xE8:
            imp();
            inx();
            break;
        case 0xE9:
            imm();
            sbc();
            break;
        case 0xEB:
            imm();
            sbc();
            break;
        case 0xEC:
            abso();
            cpx();
            break;
        case 0xED:
            abso();
            sbc();
            break;
        case 0xEE:
            abso();
            inc();
            break;
        case 0xF0:
            rel();
            beq();
            break;
        case 0xF1:
            indy();
            sbc();
            break;
        case 0xF5:
            zpx();
            sbc();
            break;
        case 0xF6:
            zpx();
            inc();
            break;
        case 0xF8:
            imp();
            sed();
            break;
        case 0xF9:
            absy();
            sbc();
            break;
        case 0xFD:
            absx();
            sbc();
            break;
        case 0xFE:
            absx();
            inc();
            break;
        }
#ifdef USE_TIMING
        clockgoal6502 -= (int32_t)pgm_read_byte_near(ticktable + opcode);
#endif
        instructions++;
    }
}

uint16_t getpc() {
    return (pc);
}

uint8_t getop() {
    return (opcode);
}
