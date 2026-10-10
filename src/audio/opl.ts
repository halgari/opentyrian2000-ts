// SPDX-License-Identifier: GPL-2.0-or-later
// Port of opl.c from OpenTyrian2000 (DOSBox OPL2 emulator), OPLTYPE_IS_OPL3 undefined.
/*
 *  Copyright (C) 2002-2010  The DOSBox Team
 *  OPL2/OPL3 emulation library
 *
 *  This library is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Lesser General Public
 *  License as published by the Free Software Foundation; either
 *  version 2.1 of the License, or (at your option) any later version.
 *
 *  This library is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public
 *  License along with this library; if not, write to the Free Software
 *  Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
 */
/*
 * Originally based on ADLIBEMU.C, an AdLib/OPL2 emulation library by Ken Silverman
 * Copyright (C) 1998-2001 Ken Silverman
 */
import type { CRand } from './crand';

// Width notes (x86_64 gcc oracle): Bitu/Bits are 64-bit; every such value in this
// file stays far below 2^53, so plain JS numbers are exact. Bit32u -> `>>> 0`,
// Bit32s -> `| 0` / Math.imul, Bit8u -> `& 0xff`.

const NUM_CHANNELS = 9;
const MAXOPERATORS = NUM_CHANNELS * 2;
const FIXEDPT = 0x10000;
const FIXEDPT_LFO = 0x1000000;
const WAVEPREC = 1024;
const INTFREQU = 14318180.0 / 288.0;
const PI = 3.1415926535897932384626433832795;

const OF_TYPE_ATT = 0;
const OF_TYPE_DEC = 1;
const OF_TYPE_REL = 2;
const OF_TYPE_SUS = 3;
const OF_TYPE_SUS_NOKEEP = 4;
const OF_TYPE_OFF = 5;

const ARC_TVS_KSR_MUL = 0x20;
const ARC_KSL_OUTLEV = 0x40;
const ARC_ATTR_DECR = 0x60;
const ARC_SUSL_RELR = 0x80;
const ARC_FREQ_NUM = 0xa0;
const ARC_KON_BNUM = 0xb0;
const ARC_PERC_MODE = 0xbd;
const ARC_FEEDBACK = 0xc0;
const ARC_WAVE_SEL = 0xe0;

const OP_ACT_OFF = 0x00;
const OP_ACT_NORMAL = 0x01;
const OP_ACT_PERC = 0x02;

const BLOCKBUF_SIZE = 512;
const VIBTAB_SIZE = 8;
const TREMTAB_SIZE = 53;
const TREM_FREQ = 3.7;

const kslmul = [0.0, 0.5, 0.25, 1.0];
const frqmulTab = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15];
const modulatorbase = [0, 1, 2, 8, 9, 10, 16, 17, 18];
const regbase2modop = [0, 1, 2, 0, 1, 2, 0, 0, 3, 4, 5, 3, 4, 5, 0, 0, 6, 7, 8, 6, 7, 8];
const regbase2op = [0, 1, 2, 9, 10, 11, 0, 0, 3, 4, 5, 12, 13, 14, 0, 0, 6, 7, 8, 15, 16, 17];
const waveform = [WAVEPREC, WAVEPREC >> 1, WAVEPREC, (WAVEPREC * 3) >> 2, 0, 0, (WAVEPREC * 5) >> 2, WAVEPREC << 1];
const wavemask = [
  WAVEPREC - 1, WAVEPREC - 1, (WAVEPREC >> 1) - 1, (WAVEPREC >> 1) - 1,
  WAVEPREC - 1, ((WAVEPREC * 3) >> 2) - 1, WAVEPREC >> 1, WAVEPREC - 1,
];
const wavestart = [0, WAVEPREC >> 1, 0, WAVEPREC >> 2, 0, 0, 0, WAVEPREC >> 3];
const attackconst = [1 / 2.82624, 1 / 2.2528, 1 / 1.88416, 1 / 1.59744];
const decrelconst = [1 / 39.28064, 1 / 31.41608, 1 / 26.17344, 1 / 22.44608];
const stepSkipMask = [0xff, 0xfe, 0xee, 0xba, 0xaa];

// struct operator_struct (op_type)
class Op {
  cval = 0; lastcval = 0; // Bit32s
  tcount = 0; wfpos = 0; tinc = 0; // Bit32u
  amp = 0; stepAmp = 0; vol = 0; sustainLevel = 0; // double
  mfbi = 0; // Bit32s
  a0 = 0; a1 = 0; a2 = 0; a3 = 0;
  decaymul = 0; releasemul = 0;
  opState = 0; // Bit32u
  toff = 0; // Bit32u
  freqHigh = 0; // Bit32s
  curWform = 0; // offset into wavtable (C: Bit16s* cur_wform)
  curWmask = 0; // Bit32u
  actState = 0; // Bit32u
  susKeep = false;
  vibrato = false;
  tremolo = false;
  generatorPos = 0; // Bit32u
  curEnvStep = 0; // Bits (64-bit)
  envStepA = 0; envStepD = 0; envStepR = 0; // Bits
  stepSkipPosA = 0; // Bit8u
  envStepSkipA = 0; // Bits
}

export class Opl {
  private readonly rand: CRand;
  private readonly op: Op[] = [];
  private intSamplerate = 0;
  private status = 0; // Bit8u
  private oplIndex = 0; // Bit32u
  private readonly adlibreg = new Uint8Array(256);
  private readonly waveSel = new Uint8Array(22);
  private vibtabPos = 0; private vibtabAdd = 0; // Bit32u
  private tremtabPos = 0; private tremtabAdd = 0; // Bit32u
  private generatorAdd = 0; // Bit32u
  private recipsamp = 0;
  private readonly wavtable = new Int16Array(WAVEPREC * 3);
  private readonly vibTable = new Int32Array(VIBTAB_SIZE);
  private readonly tremTable = new Int32Array(TREMTAB_SIZE * 2);
  private readonly vibvalConst = new Int32Array(BLOCKBUF_SIZE);
  private readonly tremvalConst = new Int32Array(BLOCKBUF_SIZE);
  private readonly vibvalVar1 = new Int32Array(BLOCKBUF_SIZE);
  private readonly vibvalVar2 = new Int32Array(BLOCKBUF_SIZE);
  private readonly frqmul = new Float64Array(16);
  private readonly kslev: Uint8Array[] = [];
  private readonly outbufl = new Int32Array(BLOCKBUF_SIZE);
  private readonly vibLut = new Int32Array(BLOCKBUF_SIZE);
  private readonly tremLut = new Int32Array(BLOCKBUF_SIZE);

  constructor(rand: CRand) {
    this.rand = rand;
    for (let i = 0; i < MAXOPERATORS; i++) this.op.push(new Op());
    for (let i = 0; i < 8; i++) this.kslev.push(new Uint8Array(16));
    this.buildStaticTables();
  }

  // static tables from the `initfirstime` block of adlib_init (opl.c)
  private buildStaticTables(): void {
    const wt = this.wavtable;
    for (let i = 0; i < WAVEPREC >> 1; i++) {
      wt[(i << 1) + WAVEPREC] = Math.trunc(16384 * Math.sin((((i << 1) * PI) * 2) / WAVEPREC));
      wt[(i << 1) + 1 + WAVEPREC] = Math.trunc(16384 * Math.sin(((((i << 1) + 1) * PI) * 2) / WAVEPREC));
      wt[i] = wt[(i << 1) + WAVEPREC];
    }
    for (let i = 0; i < WAVEPREC >> 3; i++) {
      wt[i + (WAVEPREC << 1)] = wt[i + (WAVEPREC >> 3)] - 16384; // Int16Array store wraps like (Bit16s)
      wt[i + ((WAVEPREC * 17) >> 3)] = wt[i + (WAVEPREC >> 2)] + 16384;
    }
    const k = this.kslev;
    const k7 = [0, 24, 32, 37, 40, 43, 45, 47, 48];
    for (let i = 0; i < 9; i++) k[7][i] = k7[i];
    for (let i = 9; i < 16; i++) k[7][i] = (i + 41) & 0xff;
    for (let j = 6; j >= 0; j--) {
      for (let i = 0; i < 16; i++) {
        let oct = k[j + 1][i] - 8;
        if (oct < 0) oct = 0;
        k[j][i] = oct;
      }
    }
  }

  // port of operator_advance (opl.c)
  private operatorAdvance(o: Op, vib: number): void {
    o.wfpos = o.tcount;
    o.tcount = (o.tcount + o.tinc) >>> 0;
    // (Bit32s)tinc*vib is a 32-bit int multiply, then signed /FIXEDPT, added into Bit32u
    o.tcount = (o.tcount + Math.trunc(Math.imul(o.tinc | 0, vib) / FIXEDPT)) >>> 0;
    o.generatorPos = (o.generatorPos + this.generatorAdd) >>> 0;
  }

  // port of operator_advance_drums (opl.c)
  private operatorAdvanceDrums(o1: Op, vib1: number, o2: Op, vib2: number, o3: Op, vib3: number): void {
    const c1 = o1.tcount >>> 16;
    const c3 = o3.tcount >>> 16;
    const phasebit = (((c1 & 0x88) ^ ((c1 << 5) & 0x80)) | ((c3 ^ (c3 << 2)) & 0x20)) !== 0 ? 0x02 : 0x00;
    const noisebit = this.rand.rand() & 1;
    const snarePhaseBit = (c1 >>> 8) & 1;

    // Hihat
    let inttm = (phasebit << 8) | (0x34 << (phasebit ^ (noisebit << 1)));
    o1.wfpos = Math.imul(inttm, FIXEDPT) >>> 0;
    o1.tcount = (o1.tcount + o1.tinc) >>> 0;
    o1.tcount = (o1.tcount + Math.trunc(Math.imul(o1.tinc | 0, vib1) / FIXEDPT)) >>> 0;
    o1.generatorPos = (o1.generatorPos + this.generatorAdd) >>> 0;

    // Snare
    inttm = ((1 + snarePhaseBit) ^ noisebit) << 8;
    o2.wfpos = Math.imul(inttm, FIXEDPT) >>> 0;
    o2.tcount = (o2.tcount + o2.tinc) >>> 0;
    o2.tcount = (o2.tcount + Math.trunc(Math.imul(o2.tinc | 0, vib2) / FIXEDPT)) >>> 0;
    o2.generatorPos = (o2.generatorPos + this.generatorAdd) >>> 0;

    // Cymbal
    inttm = (1 + phasebit) << 8;
    o3.wfpos = Math.imul(inttm, FIXEDPT) >>> 0;
    o3.tcount = (o3.tcount + o3.tinc) >>> 0;
    o3.tcount = (o3.tcount + Math.trunc(Math.imul(o3.tinc | 0, vib3) / FIXEDPT)) >>> 0;
    o3.generatorPos = (o3.generatorPos + this.generatorAdd) >>> 0;
  }

  // port of operator_output (opl.c)
  private operatorOutput(o: Op, modulator: number, trem: number): void {
    if (o.opState !== OF_TYPE_OFF) {
      o.lastcval = o.cval;
      // (Bit32u)((wfpos+modulator)/FIXEDPT): u32 + s32 wraps to u32, u32 division
      const i = ((o.wfpos + modulator) >>> 0) >>> 16;
      const w = this.wavtable[o.curWform + (i & o.curWmask)];
      o.cval = Math.trunc(((o.stepAmp * o.vol * w) * trem) / 16.0) | 0;
    }
  }

  // port of operator_sustain (opl.c)
  private operatorSustain(o: Op): void {
    const n = o.generatorPos >>> 16;
    o.curEnvStep += n;
    o.generatorPos = (o.generatorPos - Math.imul(n, FIXEDPT)) >>> 0;
  }

  // port of operator_release (opl.c)
  private operatorRelease(o: Op): void {
    if (o.amp > 0.00000001) o.amp *= o.releasemul;
    const n = o.generatorPos >>> 16;
    for (let ct = 0; ct < n; ct++) {
      o.curEnvStep++;
      if ((o.curEnvStep & o.envStepR) === 0) {
        if (o.amp <= 0.00000001) {
          o.amp = 0.0;
          if (o.opState === OF_TYPE_REL) o.opState = OF_TYPE_OFF;
        }
        o.stepAmp = o.amp;
      }
    }
    o.generatorPos = (o.generatorPos - Math.imul(n, FIXEDPT)) >>> 0;
  }

  // port of operator_decay (opl.c)
  private operatorDecay(o: Op): void {
    if (o.amp > o.sustainLevel) o.amp *= o.decaymul;
    const n = o.generatorPos >>> 16;
    for (let ct = 0; ct < n; ct++) {
      o.curEnvStep++;
      if ((o.curEnvStep & o.envStepD) === 0) {
        if (o.amp <= o.sustainLevel) {
          if (o.susKeep) {
            o.opState = OF_TYPE_SUS;
            o.amp = o.sustainLevel;
          } else {
            o.opState = OF_TYPE_SUS_NOKEEP;
          }
        }
        o.stepAmp = o.amp;
      }
    }
    o.generatorPos = (o.generatorPos - Math.imul(n, FIXEDPT)) >>> 0;
  }

  // port of operator_attack (opl.c)
  private operatorAttack(o: Op): void {
    o.amp = ((o.a3 * o.amp + o.a2) * o.amp + o.a1) * o.amp + o.a0;
    const n = o.generatorPos >>> 16;
    for (let ct = 0; ct < n; ct++) {
      o.curEnvStep++;
      if ((o.curEnvStep & o.envStepA) === 0) {
        if (o.amp > 1.0) {
          o.opState = OF_TYPE_DEC;
          o.amp = 1.0;
          o.stepAmp = 1.0;
        }
        o.stepSkipPosA = (o.stepSkipPosA << 1) & 0xff; // Bit8u
        if (o.stepSkipPosA === 0) o.stepSkipPosA = 1;
        if ((o.stepSkipPosA & o.envStepSkipA) !== 0) o.stepAmp = o.amp;
      }
    }
    o.generatorPos = (o.generatorPos - Math.imul(n, FIXEDPT)) >>> 0;
  }

  // port of opfuncs[] dispatch table (opl.c)
  private opfunc(o: Op): void {
    switch (o.opState) {
      case 0: this.operatorAttack(o); break;
      case 1: this.operatorDecay(o); break;
      case 2: this.operatorRelease(o); break;
      case 3: this.operatorSustain(o); break;
      case 4: this.operatorRelease(o); break;
      default: break; // operator_off
    }
  }

  // port of change_attackrate (opl.c)
  private changeAttackrate(regbase: number, o: Op): void {
    const attackrate = this.adlibreg[ARC_ATTR_DECR + regbase] >> 4;
    if (attackrate) {
      const f = Math.pow(2.0, attackrate + (o.toff >>> 2) - 1) * attackconst[o.toff & 3] * this.recipsamp;
      o.a0 = 0.0377 * f;
      o.a1 = 10.73 * f + 1;
      o.a2 = -17.57 * f;
      o.a3 = 7.42 * f;

      const stepSkip = attackrate * 4 + o.toff;
      const steps = stepSkip >> 2;
      o.envStepA = (1 << (steps <= 12 ? 12 - steps : 0)) - 1;

      const stepNum = stepSkip <= 48 ? 4 - (stepSkip & 3) : 0;
      o.envStepSkipA = stepSkipMask[stepNum];

      if (stepSkip >= 62) {
        o.a0 = 2.0;
        o.a1 = 0.0;
        o.a2 = 0.0;
        o.a3 = 0.0;
      }
    } else {
      o.a0 = 0.0;
      o.a1 = 1.0;
      o.a2 = 0.0;
      o.a3 = 0.0;
      o.envStepA = 0;
      o.envStepSkipA = 0;
    }
  }

  // port of change_decayrate (opl.c)
  private changeDecayrate(regbase: number, o: Op): void {
    const decayrate = this.adlibreg[ARC_ATTR_DECR + regbase] & 15;
    if (decayrate) {
      const f = -7.4493 * decrelconst[o.toff & 3] * this.recipsamp;
      o.decaymul = Math.pow(2.0, f * Math.pow(2.0, decayrate + (o.toff >>> 2)));
      const steps = (decayrate * 4 + o.toff) >> 2;
      o.envStepD = (1 << (steps <= 12 ? 12 - steps : 0)) - 1;
    } else {
      o.decaymul = 1.0;
      o.envStepD = 0;
    }
  }

  // port of change_releaserate (opl.c)
  private changeReleaserate(regbase: number, o: Op): void {
    const releaserate = this.adlibreg[ARC_SUSL_RELR + regbase] & 15;
    if (releaserate) {
      const f = -7.4493 * decrelconst[o.toff & 3] * this.recipsamp;
      o.releasemul = Math.pow(2.0, f * Math.pow(2.0, releaserate + (o.toff >>> 2)));
      const steps = (releaserate * 4 + o.toff) >> 2;
      o.envStepR = (1 << (steps <= 12 ? 12 - steps : 0)) - 1;
    } else {
      o.releasemul = 1.0;
      o.envStepR = 0;
    }
  }

  // port of change_sustainlevel (opl.c)
  private changeSustainlevel(regbase: number, o: Op): void {
    const sustainlevel = this.adlibreg[ARC_SUSL_RELR + regbase] >> 4;
    if (sustainlevel < 15) o.sustainLevel = Math.pow(2.0, sustainlevel * -0.5);
    else o.sustainLevel = 0.0;
  }

  // port of change_waveform (opl.c)
  private changeWaveform(regbase: number, o: Op): void {
    o.curWmask = wavemask[this.waveSel[regbase]];
    o.curWform = waveform[this.waveSel[regbase]];
  }

  // port of change_keepsustain (opl.c)
  private changeKeepsustain(regbase: number, o: Op): void {
    o.susKeep = (this.adlibreg[ARC_TVS_KSR_MUL + regbase] & 0x20) > 0;
    if (o.opState === OF_TYPE_SUS) {
      if (!o.susKeep) o.opState = OF_TYPE_SUS_NOKEEP;
    } else if (o.opState === OF_TYPE_SUS_NOKEEP) {
      if (o.susKeep) o.opState = OF_TYPE_SUS;
    }
  }

  // port of change_vibrato (opl.c)
  private changeVibrato(regbase: number, o: Op): void {
    o.vibrato = (this.adlibreg[ARC_TVS_KSR_MUL + regbase] & 0x40) !== 0;
    o.tremolo = (this.adlibreg[ARC_TVS_KSR_MUL + regbase] & 0x80) !== 0;
  }

  // port of change_feedback (opl.c)
  private changeFeedback(chanbase: number, o: Op): void {
    const feedback = this.adlibreg[ARC_FEEDBACK + chanbase] & 14;
    if (feedback) o.mfbi = Math.trunc(Math.pow(2.0, (feedback >> 1) + 8)) | 0;
    else o.mfbi = 0;
  }

  // port of change_frequency (opl.c)
  private changeFrequency(chanbase: number, regbase: number, o: Op): void {
    const reg = this.adlibreg;
    const frn = (((reg[ARC_KON_BNUM + chanbase] & 3) << 8) + reg[ARC_FREQ_NUM + chanbase]) >>> 0;
    const oct = (reg[ARC_KON_BNUM + chanbase] >> 2) & 7;
    o.freqHigh = (frn >>> 7) & 7;

    const noteSel = (reg[8] >> 6) & 1;
    o.toff = (((frn >>> 9) & (noteSel ^ 1)) | ((frn >>> 8) & noteSel)) >>> 0;
    o.toff = (o.toff + (oct << 1)) >>> 0;

    if (!(reg[ARC_TVS_KSR_MUL + regbase] & 0x10)) o.toff >>>= 2;

    // (Bit32u)(double): frn<<oct < 2^17 and frqmul bounded, result < 2^32
    o.tinc = Math.trunc((frn << oct) * this.frqmul[reg[ARC_TVS_KSR_MUL + regbase] & 15]) >>> 0;
    const volIn = (reg[ARC_KSL_OUTLEV + regbase] & 63) +
      kslmul[reg[ARC_KSL_OUTLEV + regbase] >> 6] * this.kslev[oct][frn >>> 6];
    o.vol = Math.pow(2.0, volIn * -0.125 - 14);

    this.changeAttackrate(regbase, o);
    this.changeDecayrate(regbase, o);
    this.changeReleaserate(regbase, o);
  }

  // port of enable_operator (opl.c)
  private enableOperator(regbase: number, o: Op, actType: number): void {
    if (o.actState === OP_ACT_OFF) {
      o.tcount = Math.imul(wavestart[this.waveSel[regbase]], FIXEDPT) >>> 0;
      o.opState = OF_TYPE_ATT;
      o.actState = (o.actState | actType) >>> 0;
    }
  }

  // port of disable_operator (opl.c)
  private disableOperator(o: Op, actType: number): void {
    if (o.actState !== OP_ACT_OFF) {
      o.actState = (o.actState & ~actType) >>> 0;
      if (o.actState === OP_ACT_OFF) {
        if (o.opState !== OF_TYPE_OFF) o.opState = OF_TYPE_REL;
      }
    }
  }

  // port of adlib_init (opl.c)
  init(samplerate: number): void {
    this.intSamplerate = samplerate >>> 0;
    this.generatorAdd = Math.trunc((INTFREQU * FIXEDPT) / this.intSamplerate) >>> 0;

    this.adlibreg.fill(0);
    this.waveSel.fill(0);
    for (let i = 0; i < MAXOPERATORS; i++) {
      const o = new Op(); // memset(op, 0)
      this.op[i] = o;
      o.opState = OF_TYPE_OFF;
      o.actState = OP_ACT_OFF;
      o.curWmask = wavemask[0];
      o.curWform = waveform[0];
    }

    this.recipsamp = 1.0 / this.intSamplerate;
    for (let i = 15; i >= 0; i--) {
      this.frqmul[i] = ((frqmulTab[i] * INTFREQU) / WAVEPREC) * FIXEDPT * this.recipsamp;
    }

    this.status = 0;
    this.oplIndex = 0;

    // vibrato table
    this.vibTable[0] = 8;
    this.vibTable[1] = 4;
    this.vibTable[2] = 0;
    this.vibTable[3] = -4;
    for (let i = 4; i < VIBTAB_SIZE; i++) this.vibTable[i] = this.vibTable[i - 4] * -1;

    // VIBTAB_SIZE*FIXEDPT_LFO/8192 is an int expression (16384), then *INTFREQU/samplerate in double
    this.vibtabAdd = Math.trunc(((VIBTAB_SIZE * FIXEDPT_LFO) / 8192 * INTFREQU) / this.intSamplerate) >>> 0;
    this.vibtabPos = 0;
    this.vibvalConst.fill(0);

    // tremolo table
    const tremInt = new Int32Array(TREMTAB_SIZE);
    for (let i = 0; i < 14; i++) tremInt[i] = i - 13;
    for (let i = 14; i < 41; i++) tremInt[i] = -i + 14;
    for (let i = 41; i < 53; i++) tremInt[i] = i - 40 - 26;
    for (let i = 0; i < TREMTAB_SIZE; i++) {
      const v1 = ((tremInt[i] * 4.8) / 26.0) / 6.0;
      const v2 = ((Math.trunc(tremInt[i] / 4) * 1.2) / 6.0) / 6.0;
      this.tremTable[i] = Math.trunc(Math.pow(2.0, v1) * FIXEDPT) | 0;
      this.tremTable[TREMTAB_SIZE + i] = Math.trunc(Math.pow(2.0, v2) * FIXEDPT) | 0;
    }
    this.tremtabAdd = Math.trunc((((TREMTAB_SIZE * TREM_FREQ) * FIXEDPT_LFO) / this.intSamplerate)) >>> 0;
    this.tremtabPos = 0;
    this.tremvalConst.fill(FIXEDPT);
  }

  // port of adlib_write (opl.c)
  write(idx: number, val: number): void {
    val &= 0xff;
    const reg = this.adlibreg;
    const op = this.op;
    reg[idx] = val;

    switch (idx & 0xf0) {
      case 0x00:
        switch (idx) {
          case 0x04:
            if (val & 0x80) this.status = this.status & ~0x60 & 0xff;
            else this.status = 0;
            break;
          default:
            break;
        }
        break;
      case ARC_TVS_KSR_MUL:
      case ARC_TVS_KSR_MUL + 0x10: {
        const num = idx & 7;
        const base = (idx - ARC_TVS_KSR_MUL) & 0xff;
        if (num < 6 && base < 22) {
          const modop = regbase2modop[base];
          const regbase = base;
          const chanbase = modop;
          const opPtr = op[modop + (num < 3 ? 0 : 9)];
          this.changeKeepsustain(regbase, opPtr);
          this.changeVibrato(regbase, opPtr);
          this.changeFrequency(chanbase, base, opPtr);
        }
        break;
      }
      case ARC_KSL_OUTLEV:
      case ARC_KSL_OUTLEV + 0x10: {
        const num = idx & 7;
        const base = (idx - ARC_KSL_OUTLEV) & 0xff;
        if (num < 6 && base < 22) {
          const modop = regbase2modop[base];
          const chanbase = modop;
          const opPtr = op[modop + (num < 3 ? 0 : 9)];
          this.changeFrequency(chanbase, base, opPtr);
        }
        break;
      }
      case ARC_ATTR_DECR:
      case ARC_ATTR_DECR + 0x10: {
        const num = idx & 7;
        const base = (idx - ARC_ATTR_DECR) & 0xff;
        if (num < 6 && base < 22) {
          const opPtr = op[regbase2op[base]];
          this.changeAttackrate(base, opPtr);
          this.changeDecayrate(base, opPtr);
        }
        break;
      }
      case ARC_SUSL_RELR:
      case ARC_SUSL_RELR + 0x10: {
        const num = idx & 7;
        const base = (idx - ARC_SUSL_RELR) & 0xff;
        if (num < 6 && base < 22) {
          const opPtr = op[regbase2op[base]];
          this.changeReleaserate(base, opPtr);
          this.changeSustainlevel(base, opPtr);
        }
        break;
      }
      case ARC_FREQ_NUM: {
        const base = (idx - ARC_FREQ_NUM) & 0xff;
        if (base < 9) {
          const opbase = base;
          const modbase = modulatorbase[base];
          const chanbase = base;
          this.changeFrequency(chanbase, modbase, op[opbase]);
          this.changeFrequency(chanbase, modbase + 3, op[opbase + 9]);
        }
        break;
      }
      case ARC_KON_BNUM: {
        if (idx === ARC_PERC_MODE) {
          if ((val & 0x30) === 0x30) { // BassDrum active
            this.enableOperator(16, op[6], OP_ACT_PERC);
            this.changeFrequency(6, 16, op[6]);
            this.enableOperator(16 + 3, op[6 + 9], OP_ACT_PERC);
            this.changeFrequency(6, 16 + 3, op[6 + 9]);
          } else {
            this.disableOperator(op[6], OP_ACT_PERC);
            this.disableOperator(op[6 + 9], OP_ACT_PERC);
          }
          if ((val & 0x28) === 0x28) { // Snare active
            this.enableOperator(17 + 3, op[16], OP_ACT_PERC);
            this.changeFrequency(7, 17 + 3, op[16]);
          } else {
            this.disableOperator(op[16], OP_ACT_PERC);
          }
          if ((val & 0x24) === 0x24) { // TomTom active
            this.enableOperator(18, op[8], OP_ACT_PERC);
            this.changeFrequency(8, 18, op[8]);
          } else {
            this.disableOperator(op[8], OP_ACT_PERC);
          }
          if ((val & 0x22) === 0x22) { // Cymbal active
            this.enableOperator(18 + 3, op[8 + 9], OP_ACT_PERC);
            this.changeFrequency(8, 18 + 3, op[8 + 9]);
          } else {
            this.disableOperator(op[8 + 9], OP_ACT_PERC);
          }
          if ((val & 0x21) === 0x21) { // Hihat active
            this.enableOperator(17, op[7], OP_ACT_PERC);
            this.changeFrequency(7, 17, op[7]);
          } else {
            this.disableOperator(op[7], OP_ACT_PERC);
          }
          break;
        }
        const base = (idx - ARC_KON_BNUM) & 0xff;
        if (base < 9) {
          const opbase = base;
          const modbase = modulatorbase[base];
          if (val & 32) {
            this.enableOperator(modbase, op[opbase], OP_ACT_NORMAL);
            this.enableOperator(modbase + 3, op[opbase + 9], OP_ACT_NORMAL);
          } else {
            this.disableOperator(op[opbase], OP_ACT_NORMAL);
            this.disableOperator(op[opbase + 9], OP_ACT_NORMAL);
          }
          const chanbase = base;
          this.changeFrequency(chanbase, modbase, op[opbase]);
          this.changeFrequency(chanbase, modbase + 3, op[opbase + 9]);
        }
        break;
      }
      case ARC_FEEDBACK: {
        const base = (idx - ARC_FEEDBACK) & 0xff;
        if (base < 9) this.changeFeedback(base, op[base]);
        break;
      }
      case ARC_WAVE_SEL:
      case ARC_WAVE_SEL + 0x10: {
        const num = idx & 7;
        const base = (idx - ARC_WAVE_SEL) & 0xff;
        if (num < 6 && base < 22) {
          if (reg[0x01] & 0x20) {
            this.waveSel[base] = val & 3;
            const opPtr = op[regbase2modop[base] + (num < 3 ? 0 : 9)];
            this.changeWaveform(base, opPtr);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // port of adlib_reg_read (opl.c)
  regRead(port: number): number {
    if ((port & 1) === 0) return this.status | 6;
    return 0xff;
  }

  // port of adlib_write_index (opl.c)
  writeIndex(_port: number, val: number): void {
    this.oplIndex = val & 0xff;
  }

  // port of vibval fill loops (opl.c): (Bit32s)((vib_lut[i]*freq_high/8)*FIXEDPT*VIBFAC), VIBFAC = 70/50000
  private fillVib(buf: Int32Array, n: number, freqHigh: number): void {
    const lut = this.vibLut;
    for (let i = 0; i < n; i++) {
      const x = Math.trunc((lut[i] * freqHigh) / 8); // int division
      buf[i] = Math.trunc((Math.imul(x, FIXEDPT) * 70) / 50000);
    }
  }

  // port of adlib_getsample (opl.c)
  getSample(out: Int16Array, offset: number, numsamples: number): void {
    const op = this.op;
    const reg = this.adlibreg;
    const outbufl = this.outbufl;
    const vibLut = this.vibLut;
    const tremLut = this.tremLut;
    const vibvalConst = this.vibvalConst;
    const tremvalConst = this.tremvalConst;
    const vibvalVar1 = this.vibvalVar1;
    const vibvalVar2 = this.vibvalVar2;
    let sp = offset;

    for (let cursmp = 0, endsamples = 0; cursmp < numsamples; cursmp += endsamples) {
      endsamples = numsamples - cursmp;
      if (endsamples > BLOCKBUF_SIZE) endsamples = BLOCKBUF_SIZE;
      outbufl.fill(0, 0, endsamples);

      const vibTshift = (reg[ARC_PERC_MODE] & 0x40) === 0 ? 1 : 0;
      for (let i = 0; i < endsamples; i++) {
        this.vibtabPos = (this.vibtabPos + this.vibtabAdd) >>> 0;
        if (this.vibtabPos >>> 24 >= VIBTAB_SIZE) this.vibtabPos = (this.vibtabPos - VIBTAB_SIZE * FIXEDPT_LFO) >>> 0;
        vibLut[i] = this.vibTable[this.vibtabPos >>> 24] >> vibTshift;

        this.tremtabPos = (this.tremtabPos + this.tremtabAdd) >>> 0;
        if (this.tremtabPos >>> 24 >= TREMTAB_SIZE) this.tremtabPos = (this.tremtabPos - TREMTAB_SIZE * FIXEDPT_LFO) >>> 0;
        if (reg[ARC_PERC_MODE] & 0x80) tremLut[i] = this.tremTable[this.tremtabPos >>> 24];
        else tremLut[i] = this.tremTable[TREMTAB_SIZE + (this.tremtabPos >>> 24)];
      }

      let vibval1: Int32Array;
      let vibval2: Int32Array;
      let vibval3: Int32Array;
      let vibval4: Int32Array;
      let tremval1: Int32Array;
      let tremval2: Int32Array;
      let tremval3: Int32Array;
      let tremval4: Int32Array;

      if (reg[ARC_PERC_MODE] & 0x20) {
        // BassDrum
        let c = 6;
        if (reg[ARC_FEEDBACK + 6] & 1) {
          if (op[c + 9].opState !== OF_TYPE_OFF) {
            if (op[c + 9].vibrato) {
              vibval1 = vibvalVar1;
              this.fillVib(vibval1, endsamples, op[c + 9].freqHigh);
            } else vibval1 = vibvalConst;
            tremval1 = op[c + 9].tremolo ? tremLut : tremvalConst;
            for (let i = 0; i < endsamples; i++) {
              this.operatorAdvance(op[c + 9], vibval1[i]);
              this.opfunc(op[c + 9]);
              this.operatorOutput(op[c + 9], 0, tremval1[i]);
              const chanval = Math.imul(op[c + 9].cval, 2);
              outbufl[i] += chanval;
            }
          }
        } else {
          if (op[c + 9].opState !== OF_TYPE_OFF || op[c].opState !== OF_TYPE_OFF) {
            if (op[c].vibrato && op[c].opState !== OF_TYPE_OFF) {
              vibval1 = vibvalVar1;
              this.fillVib(vibval1, endsamples, op[c].freqHigh);
            } else vibval1 = vibvalConst;
            if (op[c + 9].vibrato && op[c + 9].opState !== OF_TYPE_OFF) {
              vibval2 = vibvalVar2;
              this.fillVib(vibval2, endsamples, op[c + 9].freqHigh);
            } else vibval2 = vibvalConst;
            tremval1 = op[c].tremolo ? tremLut : tremvalConst;
            tremval2 = op[c + 9].tremolo ? tremLut : tremvalConst;
            for (let i = 0; i < endsamples; i++) {
              this.operatorAdvance(op[c], vibval1[i]);
              this.opfunc(op[c]);
              this.operatorOutput(op[c], Math.trunc(Math.imul(op[c].lastcval + op[c].cval, op[c].mfbi) / 2), tremval1[i]);

              this.operatorAdvance(op[c + 9], vibval2[i]);
              this.opfunc(op[c + 9]);
              this.operatorOutput(op[c + 9], Math.imul(op[c].cval, FIXEDPT), tremval2[i]);

              const chanval = Math.imul(op[c + 9].cval, 2);
              outbufl[i] += chanval;
            }
          }
        }

        // TomTom (j=8)
        if (op[8].opState !== OF_TYPE_OFF) {
          c = 8;
          if (op[c].vibrato) {
            vibval3 = vibvalVar1;
            this.fillVib(vibval3, endsamples, op[c].freqHigh);
          } else vibval3 = vibvalConst;
          tremval3 = op[c].tremolo ? tremLut : tremvalConst;
          for (let i = 0; i < endsamples; i++) {
            this.operatorAdvance(op[c], vibval3[i]);
            this.opfunc(op[c]);
            this.operatorOutput(op[c], 0, tremval3[i]);
            const chanval = Math.imul(op[c].cval, 2);
            outbufl[i] += chanval;
          }
        }

        // Snare/Hihat (j=7), Cymbal (j=8)
        if (op[7].opState !== OF_TYPE_OFF || op[16].opState !== OF_TYPE_OFF || op[17].opState !== OF_TYPE_OFF) {
          c = 7;
          if (op[c].vibrato && op[c].opState !== OF_TYPE_OFF) {
            vibval1 = vibvalVar1;
            this.fillVib(vibval1, endsamples, op[c].freqHigh);
          } else vibval1 = vibvalConst;
          // note: C tests `op_state == OF_TYPE_OFF` here (not !=); kept as is
          if (op[c + 9].vibrato && op[c + 9].opState === OF_TYPE_OFF) {
            vibval2 = vibvalVar2;
            this.fillVib(vibval2, endsamples, op[c + 9].freqHigh);
          } else vibval2 = vibvalConst;
          tremval1 = op[c].tremolo ? tremLut : tremvalConst;
          tremval2 = op[c + 9].tremolo ? tremLut : tremvalConst;

          c = 8;
          // vibval4 may alias vibval2 (both vibvalVar2), as in C; vibval4 is filled last
          if (op[c + 9].vibrato && op[c + 9].opState === OF_TYPE_OFF) {
            vibval4 = vibvalVar2;
            this.fillVib(vibval4, endsamples, op[c + 9].freqHigh);
          } else vibval4 = vibvalConst;
          tremval4 = op[c + 9].tremolo ? tremLut : tremvalConst;

          for (let i = 0; i < endsamples; i++) {
            this.operatorAdvanceDrums(op[7], vibval1[i], op[7 + 9], vibval2[i], op[8 + 9], vibval4[i]);

            this.opfunc(op[7]); // Hihat
            this.operatorOutput(op[7], 0, tremval1[i]);

            this.opfunc(op[7 + 9]); // Snare
            this.operatorOutput(op[7 + 9], 0, tremval2[i]);

            this.opfunc(op[8 + 9]); // Cymbal
            this.operatorOutput(op[8 + 9], 0, tremval4[i]);

            const chanval = Math.imul(op[7].cval + op[7 + 9].cval + op[8 + 9].cval, 2);
            outbufl[i] += chanval;
          }
        }
      }

      for (let curCh = NUM_CHANNELS - 1; curCh >= 0; curCh--) {
        if ((reg[ARC_PERC_MODE] & 0x20) && curCh >= 6 && curCh < 9) continue;
        const k = curCh;
        const m = op[curCh]; // cptr[0]
        const cr = op[curCh + 9]; // cptr[9]

        if (reg[ARC_FEEDBACK + k] & 1) {
          // 2op additive synthesis
          if (cr.opState === OF_TYPE_OFF && m.opState === OF_TYPE_OFF) continue;
          if (m.vibrato && m.opState !== OF_TYPE_OFF) {
            vibval1 = vibvalVar1;
            this.fillVib(vibval1, endsamples, m.freqHigh);
          } else vibval1 = vibvalConst;
          if (cr.vibrato && cr.opState !== OF_TYPE_OFF) {
            vibval2 = vibvalVar2;
            this.fillVib(vibval2, endsamples, cr.freqHigh);
          } else vibval2 = vibvalConst;
          tremval1 = m.tremolo ? tremLut : tremvalConst;
          tremval2 = cr.tremolo ? tremLut : tremvalConst;
          for (let i = 0; i < endsamples; i++) {
            this.operatorAdvance(m, vibval1[i]);
            this.opfunc(m);
            this.operatorOutput(m, Math.trunc(Math.imul(m.lastcval + m.cval, m.mfbi) / 2), tremval1[i]);

            this.operatorAdvance(cr, vibval2[i]);
            this.opfunc(cr);
            this.operatorOutput(cr, 0, tremval2[i]);

            const chanval = cr.cval + m.cval;
            outbufl[i] += chanval;
          }
        } else {
          // 2op frequency modulation
          if (cr.opState === OF_TYPE_OFF && m.opState === OF_TYPE_OFF) continue;
          if (m.vibrato && m.opState !== OF_TYPE_OFF) {
            vibval1 = vibvalVar1;
            this.fillVib(vibval1, endsamples, m.freqHigh);
          } else vibval1 = vibvalConst;
          if (cr.vibrato && cr.opState !== OF_TYPE_OFF) {
            vibval2 = vibvalVar2;
            this.fillVib(vibval2, endsamples, cr.freqHigh);
          } else vibval2 = vibvalConst;
          tremval1 = m.tremolo ? tremLut : tremvalConst;
          tremval2 = cr.tremolo ? tremLut : tremvalConst;
          for (let i = 0; i < endsamples; i++) {
            this.operatorAdvance(m, vibval1[i]);
            this.opfunc(m);
            this.operatorOutput(m, Math.trunc(Math.imul(m.lastcval + m.cval, m.mfbi) / 2), tremval1[i]);

            this.operatorAdvance(cr, vibval2[i]);
            this.opfunc(cr);
            this.operatorOutput(cr, Math.imul(m.cval, FIXEDPT), tremval2[i]);

            const chanval = cr.cval;
            outbufl[i] += chanval;
          }
        }
      }

      // port of clipit16 (opl.c)
      for (let i = 0; i < endsamples; i++) {
        const ival = outbufl[i];
        let v: number;
        if (ival < 32768) {
          if (ival > -32769) v = ival;
          else v = -32768;
        } else v = 32767;
        out[sp++] = v;
      }
    }
  }
}
