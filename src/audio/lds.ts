// SPDX-License-Identifier: GPL-2.0-or-later
// Port of lds_play.c (OpenTyrian; adapted from AdPlug's LDS player).
import { BinaryReader } from '../core/binary-reader';
import { s8 } from '../core/int';
import type { Opl } from './opl';

const OP_TABLE = [0x00, 0x01, 0x02, 0x08, 0x09, 0x0a, 0x10, 0x11, 0x12];

/* Note frequency table (16 notes / octave) */
const FREQUENCY = Uint16Array.from([
  343, 344, 345, 347, 348, 349, 350, 352, 353, 354, 356, 357, 358,
  359, 361, 362, 363, 365, 366, 367, 369, 370, 371, 373, 374, 375,
  377, 378, 379, 381, 382, 384, 385, 386, 388, 389, 391, 392, 393,
  395, 396, 398, 399, 401, 402, 403, 405, 406, 408, 409, 411, 412,
  414, 415, 417, 418, 420, 421, 423, 424, 426, 427, 429, 430, 432,
  434, 435, 437, 438, 440, 442, 443, 445, 446, 448, 450, 451, 453,
  454, 456, 458, 459, 461, 463, 464, 466, 468, 469, 471, 473, 475,
  476, 478, 480, 481, 483, 485, 487, 488, 490, 492, 494, 496, 497,
  499, 501, 503, 505, 506, 508, 510, 512, 514, 516, 518, 519, 521,
  523, 525, 527, 529, 531, 533, 535, 537, 538, 540, 542, 544, 546,
  548, 550, 552, 554, 556, 558, 560, 562, 564, 566, 568, 571, 573,
  575, 577, 579, 581, 583, 585, 587, 589, 591, 594, 596, 598, 600,
  602, 604, 607, 609, 611, 613, 615, 618, 620, 622, 624, 627, 629,
  631, 633, 636, 638, 640, 643, 645, 647, 650, 652, 654, 657, 659,
  662, 664, 666, 669, 671, 674, 676, 678, 681, 683,
]);

/* Vibrato (sine) table */
const VIBTAB = Uint8Array.from([
  0, 13, 25, 37, 50, 62, 74, 86, 98, 109, 120, 131, 142, 152, 162,
  171, 180, 189, 197, 205, 212, 219, 225, 231, 236, 240, 244, 247,
  250, 252, 254, 255, 255, 255, 254, 252, 250, 247, 244, 240, 236,
  231, 225, 219, 212, 205, 197, 189, 180, 171, 162, 152, 142, 131,
  120, 109, 98, 86, 74, 62, 50, 37, 25, 13,
]);

/* Tremolo (sine * sine) table */
const TREMTAB = Uint8Array.from([
  0, 0, 1, 1, 2, 4, 5, 7, 10, 12, 15, 18, 21, 25, 29, 33, 37, 42, 47,
  52, 57, 62, 67, 73, 79, 85, 90, 97, 103, 109, 115, 121, 128, 134,
  140, 146, 152, 158, 165, 170, 176, 182, 188, 193, 198, 203, 208,
  213, 218, 222, 226, 230, 234, 237, 240, 243, 245, 248, 250, 251,
  253, 254, 254, 255, 255, 255, 254, 254, 253, 251, 250, 248, 245,
  243, 240, 237, 234, 230, 226, 222, 218, 213, 208, 203, 198, 193,
  188, 182, 176, 170, 165, 158, 152, 146, 140, 134, 127, 121, 115,
  109, 103, 97, 90, 85, 79, 73, 67, 62, 57, 52, 47, 42, 37, 33, 29,
  25, 21, 18, 15, 12, 10, 7, 5, 4, 2, 1, 1, 0,
]);

const MAXSOUND = 0x3f;
const MAXPOS = 0xff;

/** SoundBank (lds_play.h); all fields are unsigned 8/16 bit as read from the file. */
class SoundBank {
  modMisc = 0; modVol = 0; modAd = 0; modSr = 0; modWave = 0;
  carMisc = 0; carVol = 0; carAd = 0; carSr = 0; carWave = 0;
  feedback = 0; keyoff = 0; portamento = 0; glide = 0; finetune = 0;
  vibrato = 0; vibdelay = 0; modTrem = 0; carTrem = 0; tremwait = 0; arpeggio = 0;
  arpTab = new Uint8Array(12);
  start = 0; size = 0; fms = 0; transp = 0;
  midinst = 0; midvelo = 0; midkey = 0; midtrans = 0; middum1 = 0; middum2 = 0;
}

/** Channel (lds_play.h). u8 fields are wrapped by the code that assigns them. */
class Channel {
  gototune = 0; lasttune = 0; packpos = 0; // u16
  finetune = 0; glideto = 0; portspeed = 0; nextvol = 0; volmod = 0; volcar = 0;
  vibwait = 0; vibspeed = 0; vibrate = 0; trmstay = 0; trmwait = 0; trmspeed = 0; trmrate = 0; trmcount = 0;
  trcwait = 0; trcspeed = 0; trcrate = 0; trccount = 0; arpSize = 0; arpSpeed = 0; keycount = 0;
  vibcount = 0; arpPos = 0; arpCount = 0; packwait = 0;
  arpTab = new Uint8Array(12);
  chandelay = 0; sound = 0; high = 0; // chancheat
}

export class LdsPlayer {
  playing = false;
  songlooped = false;

  private soundbank: SoundBank[] = [];
  private readonly channel: Channel[] = Array.from({ length: 9 }, () => new Channel());
  private positionsPatnum = new Uint16Array(0);
  private positionsTranspose = new Uint8Array(0);
  private havePositions = false;
  private patterns = new Uint16Array(0);

  private readonly fmchip = new Uint8Array(0xff);
  private jumping = 0; private fadeonoff = 0; private allvolume = 0; private hardfade = 0;
  private tempoNow = 0; private pattplay = 0; private tempo = 0; private regbd = 0;
  private readonly chandelay = new Uint8Array(9);
  private mode = 0; private pattlen = 0;
  private posplay = 0; private jumppos = 0; private speed = 0; // u16
  private numpatch = 0; private numposi = 0; private mainvolume = 0;

  constructor(private readonly opl: Opl, private readonly sampleRate: number) {}

  // port of lds_load (lds_play.c); `song` is the song's byte slice (music_offset..+music_size)
  load(song: Uint8Array): boolean {
    const f = new BinaryReader(song);

    /* load header */
    this.mode = f.u8();
    if (this.mode > 2) return false;
    this.speed = f.u16();
    this.tempo = f.u8();
    this.pattlen = f.u8();
    for (let i = 0; i < 9; i++) this.chandelay[i] = f.u8();
    this.regbd = f.u8();

    /* load patches */
    this.numpatch = f.u16();
    this.soundbank = [];
    for (let i = 0; i < this.numpatch; i++) {
      const sb = new SoundBank();
      sb.modMisc = f.u8(); sb.modVol = f.u8(); sb.modAd = f.u8(); sb.modSr = f.u8(); sb.modWave = f.u8();
      sb.carMisc = f.u8(); sb.carVol = f.u8(); sb.carAd = f.u8(); sb.carSr = f.u8(); sb.carWave = f.u8();
      sb.feedback = f.u8(); sb.keyoff = f.u8(); sb.portamento = f.u8(); sb.glide = f.u8();
      sb.finetune = f.u8(); sb.vibrato = f.u8(); sb.vibdelay = f.u8();
      sb.modTrem = f.u8(); sb.carTrem = f.u8(); sb.tremwait = f.u8(); sb.arpeggio = f.u8();
      sb.arpTab.set(f.bytes(12));
      sb.start = f.u16(); sb.size = f.u16(); sb.fms = f.u8(); sb.transp = f.u16();
      sb.midinst = f.u8(); sb.midvelo = f.u8(); sb.midkey = f.u8(); sb.midtrans = f.u8();
      sb.middum1 = f.u8(); sb.middum2 = f.u8();
      this.soundbank.push(sb);
    }

    /* load positions */
    this.numposi = f.u16();
    this.positionsPatnum = new Uint16Array(9 * this.numposi);
    this.positionsTranspose = new Uint8Array(9 * this.numposi);
    for (let i = 0; i < this.numposi; i++) {
      for (let j = 0; j < 9; j++) {
        // patnum is a byte offset into the pattern space; /2 gives the 16-bit word index
        this.positionsPatnum[i * 9 + j] = f.u16() / 2;
        this.positionsTranspose[i * 9 + j] = f.u8();
      }
    }
    this.havePositions = true;

    /* load patterns */
    f.skip(2); /* ignore # of digital sounds */
    const numpatterns = (song.length - f.pos) >> 1;
    this.patterns = new Uint16Array(numpatterns);
    for (let i = 0; i < numpatterns; i++) this.patterns[i] = f.u16();

    this.rewind();
    return true;
  }

  // port of lds_rewind (lds_play.c)
  rewind(): void {
    /* init all with 0 */
    this.tempoNow = 3;
    this.playing = true; this.songlooped = false;
    this.jumping = this.fadeonoff = this.allvolume = this.hardfade = this.pattplay = this.posplay = this.jumppos = this.mainvolume = 0;
    for (let i = 0; i < 9; i++) this.channel[i] = new Channel();
    this.fmchip.fill(0);

    /* OPL2 init */
    const opl = this.opl;
    opl.init(this.sampleRate); /* Reset OPL chip */
    opl.write(1, 0x20);
    opl.write(8, 0);
    opl.write(0xbd, this.regbd);

    for (let i = 0; i < 9; i++) {
      const o = OP_TABLE[i];
      opl.write(0x20 + o, 0);
      opl.write(0x23 + o, 0);
      opl.write(0x40 + o, 0x3f);
      opl.write(0x43 + o, 0x3f);
      opl.write(0x60 + o, 0xff);
      opl.write(0x63 + o, 0xff);
      opl.write(0x80 + o, 0xff);
      opl.write(0x83 + o, 0xff);
      opl.write(0xe0 + o, 0);
      opl.write(0xe3 + o, 0);
      opl.write(0xa0 + i, 0);
      opl.write(0xb0 + i, 0);
      opl.write(0xc0 + i, 0);
    }
  }

  // port of lds_fade (lds_play.c)
  fade(speed: number): void {
    this.fadeonoff = speed & 0xff;
  }

  // port of lds_setregs (lds_play.c)
  private setregs(reg: number, val: number): void {
    reg &= 0xff; val &= 0xff;
    if (this.fmchip[reg] === val) return;
    this.fmchip[reg] = val;
    this.opl.write(reg, val);
  }

  // port of lds_setregs_adv (lds_play.c)
  private setregsAdv(reg: number, mask: number, val: number): void {
    reg &= 0xff;
    this.setregs(reg, (this.fmchip[reg] & mask) | (val & 0xff));
  }

  // port of lds_update (lds_play.c)
  update(): boolean {
    if (!this.playing) return false;
    const channel = this.channel;
    const fmchip = this.fmchip;

    /* handle fading */
    if (this.fadeonoff) {
      if (this.fadeonoff <= 128) {
        if (this.allvolume > this.fadeonoff || this.allvolume === 0) {
          this.allvolume = (this.allvolume - this.fadeonoff) & 0xff;
        } else {
          this.allvolume = 1;
          this.fadeonoff = 0;
          if (this.hardfade !== 0) {
            this.playing = false;
            this.hardfade = 0;
            for (let i = 0; i < 9; i++) channel[i].keycount = 1;
          }
        }
      } else {
        if (((this.allvolume + (0x100 - this.fadeonoff)) & 0xff) <= this.mainvolume) {
          this.allvolume = (this.allvolume + 0x100 - this.fadeonoff) & 0xff;
        } else {
          this.allvolume = this.mainvolume;
          this.fadeonoff = 0;
        }
      }
    }

    /* handle channel delay */
    for (let chan = 0; chan < 9; chan++) {
      const c = channel[chan];
      if (c.chandelay) {
        c.chandelay = (c.chandelay - 1) & 0xff;
        if (!c.chandelay) this.playsound(c.sound, chan, c.high);
      }
    }

    /* handle notes */
    if (!this.tempoNow && this.havePositions) {
      let vbreak = false;
      for (let chan = 0; chan < 9; chan++) {
        const c = channel[chan];
        if (!c.packwait) {
          const patnum = this.positionsPatnum[this.posplay * 9 + chan];
          const transpose = this.positionsTranspose[this.posplay * 9 + chan];

          const comword = this.patterns[patnum + c.packpos] | 0;
          const comhi = comword >> 8, comlo = comword & 0xff;
          if (comword) {
            if (comhi === 0x80) {
              c.packwait = comlo;
            } else if (comhi >= 0x80) {
              switch (comhi) {
                case 0xff:
                  c.volcar = (((c.volcar & 0x3f) * comlo) >> 6) & 0x3f;
                  if (fmchip[0xc0 + chan] & 1) c.volmod = (((c.volmod & 0x3f) * comlo) >> 6) & 0x3f;
                  break;
                case 0xfe:
                  this.tempo = comword & 0x3f;
                  break;
                case 0xfd:
                  c.nextvol = comlo;
                  break;
                case 0xfc:
                  this.playing = false;
                  break;
                case 0xfb:
                  c.keycount = 1;
                  break;
                case 0xfa:
                  vbreak = true;
                  this.jumppos = (this.posplay + 1) & MAXPOS;
                  break;
                case 0xf9:
                  vbreak = true;
                  this.jumppos = comlo & MAXPOS;
                  this.jumping = 1;
                  if (this.jumppos < this.posplay) this.songlooped = true;
                  break;
                case 0xf8:
                  c.lasttune = 0;
                  break;
                case 0xf7:
                  c.vibwait = 0;
                  c.vibspeed = (comlo >> 4) + 2;
                  c.vibrate = (comlo & 15) + 1;
                  break;
                case 0xf6:
                  c.glideto = comlo;
                  break;
                case 0xf5:
                  c.finetune = comlo;
                  break;
                case 0xf4:
                  if (!this.hardfade) {
                    this.allvolume = this.mainvolume = comlo;
                    this.fadeonoff = 0;
                  }
                  break;
                case 0xf3:
                  if (!this.hardfade) this.fadeonoff = comlo;
                  break;
                case 0xf2:
                  c.trmstay = comlo;
                  break;
                case 0xf1: /* panorama */
                case 0xf0: /* progch: MIDI commands (unhandled) */
                  break;
                default:
                  if (comhi < 0xa0) c.glideto = comhi & 0x1f;
                  break;
              }
            } else {
              let transp = transpose & 127; // Sint8
              if (transpose & 64) transp |= 128;
              transp = s8(transp);
              let sound: number, high: number;
              if (transpose & 128) {
                sound = (comlo + transp) & MAXSOUND;
                high = (comhi << 4) & 0xffff;
              } else {
                sound = comlo & MAXSOUND;
                high = ((comhi + transp) << 4) & 0xffff;
              }
              if (!this.chandelay[chan]) {
                this.playsound(sound, chan, high);
              } else {
                c.chandelay = this.chandelay[chan];
                c.sound = sound;
                c.high = high;
              }
            }
          }
          c.packpos = (c.packpos + 1) & 0xffff;
        } else {
          c.packwait = (c.packwait - 1) & 0xff;
        }
      }

      this.tempoNow = this.tempo;
      this.pattplay = (this.pattplay + 1) & 0xff;
      if (vbreak) {
        this.pattplay = 0;
        for (let i = 0; i < 9; i++) channel[i].packpos = channel[i].packwait = 0;
        this.posplay = this.jumppos;
      } else if (this.pattplay >= this.pattlen) {
        this.pattplay = 0;
        for (let i = 0; i < 9; i++) channel[i].packpos = channel[i].packwait = 0;
        this.posplay = (this.posplay + 1) & MAXPOS;
      }
    } else {
      this.tempoNow = (this.tempoNow - 1) & 0xff;
    }

    /* make effects */
    for (let chan = 0; chan < 9; chan++) {
      const c = channel[chan];
      const regnum = OP_TABLE[chan];
      let arpreg: number, freq: number, octave: number, tune: number;
      if (c.keycount > 0) {
        if (c.keycount === 1) this.setregsAdv(0xb0 + chan, 0xdf, 0);
        c.keycount = (c.keycount - 1) & 0xff;
      }

      /* arpeggio */
      if (c.arpSize === 0) {
        arpreg = 0;
      } else {
        arpreg = ((c.arpTab[c.arpPos] | 0) << 4) & 0xffff;
        if (arpreg === 0x800) {
          if (c.arpPos > 0) c.arpTab[0] = c.arpTab[c.arpPos - 1];
          c.arpSize = 1; c.arpPos = 0;
          arpreg = (c.arpTab[0] << 4) & 0xffff;
        }
        if (c.arpCount === c.arpSpeed) {
          c.arpPos = (c.arpPos + 1) & 0xff;
          if (c.arpPos >= c.arpSize) c.arpPos = 0;
          c.arpCount = 0;
        } else {
          c.arpCount = (c.arpCount + 1) & 0xff;
        }
      }

      /* glide & portamento */
      if (c.lasttune && c.lasttune !== c.gototune) {
        if (c.lasttune > c.gototune) {
          if (c.lasttune - c.gototune < c.portspeed) c.lasttune = c.gototune;
          else c.lasttune = (c.lasttune - c.portspeed) & 0xffff;
        } else {
          if (c.gototune - c.lasttune < c.portspeed) c.lasttune = c.gototune;
          else c.lasttune = (c.lasttune + c.portspeed) & 0xffff;
        }

        if (arpreg >= 0x800) arpreg = (c.lasttune - (arpreg ^ 0xff0) - 16) & 0xffff;
        else arpreg = (arpreg + c.lasttune) & 0xffff;

        freq = FREQUENCY[arpreg % (12 * 16)];
        octave = ((arpreg / (12 * 16) | 0) - 1) & 0xffff;
        this.setregs(0xa0 + chan, freq & 0xff);
        this.setregsAdv(0xb0 + chan, 0x20, ((octave << 2) + (freq >> 8)) & 0xdf);
      } else {
        /* vibrato */
        if (!c.vibwait) {
          if (c.vibrate) {
            const wibc = (VIBTAB[c.vibcount & 0x3f] * c.vibrate) & 0xffff;
            if ((c.vibcount & 0x40) === 0) tune = (c.lasttune + (wibc >> 8)) & 0xffff;
            else tune = (c.lasttune - (wibc >> 8)) & 0xffff;

            if (arpreg >= 0x800) tune = (tune - (arpreg ^ 0xff0) - 16) & 0xffff;
            else tune = (tune + arpreg) & 0xffff;

            freq = FREQUENCY[tune % (12 * 16)];
            octave = ((tune / (12 * 16) | 0) - 1) & 0xffff;
            this.setregs(0xa0 + chan, freq & 0xff);
            this.setregsAdv(0xb0 + chan, 0x20, ((octave << 2) + (freq >> 8)) & 0xdf);
            c.vibcount = (c.vibcount + c.vibspeed) & 0xff;
          } else if (c.arpSize !== 0) { /* no vibrato, just arpeggio */
            if (arpreg >= 0x800) tune = (c.lasttune - (arpreg ^ 0xff0) - 16) & 0xffff;
            else tune = (c.lasttune + arpreg) & 0xffff;

            freq = FREQUENCY[tune % (12 * 16)];
            octave = ((tune / (12 * 16) | 0) - 1) & 0xffff;
            this.setregs(0xa0 + chan, freq & 0xff);
            this.setregsAdv(0xb0 + chan, 0x20, ((octave << 2) + (freq >> 8)) & 0xdf);
          }
        } else { /* no vibrato, just arpeggio */
          c.vibwait = (c.vibwait - 1) & 0xff;
          if (c.arpSize !== 0) {
            if (arpreg >= 0x800) tune = (c.lasttune - (arpreg ^ 0xff0) - 16) & 0xffff;
            else tune = (c.lasttune + arpreg) & 0xffff;

            freq = FREQUENCY[tune % (12 * 16)];
            octave = ((tune / (12 * 16) | 0) - 1) & 0xffff;
            this.setregs(0xa0 + chan, freq & 0xff);
            this.setregsAdv(0xb0 + chan, 0x20, ((octave << 2) + (freq >> 8)) & 0xdf);
          }
        }
      }

      /* tremolo (modulator) */
      if (!c.trmwait) {
        if (c.trmrate) {
          const tremc = (TREMTAB[c.trmcount & 0x7f] * c.trmrate) & 0xffff;
          const level = (tremc >> 8) <= (c.volmod & 0x3f) ? (c.volmod & 0x3f) - (tremc >> 8) : 0;

          if (this.allvolume !== 0 && (fmchip[0xc0 + chan] & 1))
            this.setregsAdv(0x40 + regnum, 0xc0, ((level * this.allvolume) >> 8) ^ 0x3f);
          else
            this.setregsAdv(0x40 + regnum, 0xc0, level ^ 0x3f);

          c.trmcount = (c.trmcount + c.trmspeed) & 0xff;
        } else if (this.allvolume !== 0 && (fmchip[0xc0 + chan] & 1)) {
          this.setregsAdv(0x40 + regnum, 0xc0, ((((c.volmod & 0x3f) * this.allvolume) >> 8) ^ 0x3f) & 0x3f);
        } else {
          this.setregsAdv(0x40 + regnum, 0xc0, (c.volmod ^ 0x3f) & 0x3f);
        }
      } else {
        c.trmwait = (c.trmwait - 1) & 0xff;
        if (this.allvolume !== 0 && (fmchip[0xc0 + chan] & 1))
          this.setregsAdv(0x40 + regnum, 0xc0, ((((c.volmod & 0x3f) * this.allvolume) >> 8) ^ 0x3f) & 0x3f);
      }

      /* tremolo (carrier) */
      if (!c.trcwait) {
        if (c.trcrate) {
          const tremc = (TREMTAB[c.trccount & 0x7f] * c.trcrate) & 0xffff;
          const level = (tremc >> 8) <= (c.volcar & 0x3f) ? (c.volcar & 0x3f) - (tremc >> 8) : 0;

          if (this.allvolume !== 0)
            this.setregsAdv(0x43 + regnum, 0xc0, ((level * this.allvolume) >> 8) ^ 0x3f);
          else
            this.setregsAdv(0x43 + regnum, 0xc0, level ^ 0x3f);
          c.trccount = (c.trccount + c.trcspeed) & 0xff;
        } else if (this.allvolume !== 0) {
          this.setregsAdv(0x43 + regnum, 0xc0, ((((c.volcar & 0x3f) * this.allvolume) >> 8) ^ 0x3f) & 0x3f);
        } else {
          this.setregsAdv(0x43 + regnum, 0xc0, (c.volcar ^ 0x3f) & 0x3f);
        }
      } else {
        c.trcwait = (c.trcwait - 1) & 0xff;
        if (this.allvolume !== 0)
          this.setregsAdv(0x43 + regnum, 0xc0, ((((c.volcar & 0x3f) * this.allvolume) >> 8) ^ 0x3f) & 0x3f);
      }
    }

    return !(!this.playing || this.songlooped);
  }

  // port of lds_playsound (lds_play.c)
  private playsound(instNumber: number, channelNumber: number, tunehigh: number): void {
    const c = this.channel[channelNumber];
    const i = this.soundbank[instNumber];
    const regnum = OP_TABLE[channelNumber];
    let volcalc: number;

    /* set fine tune */
    tunehigh += ((i.finetune + c.finetune + 0x80) & 0xff) - 0x80;

    /* arpeggio handling */
    if (!i.arpeggio) {
      const arpcalc = (i.arpTab[0] << 4) & 0xffff;
      if (arpcalc > 0x800) tunehigh = tunehigh - (arpcalc ^ 0xff0) - 16;
      else tunehigh += arpcalc;
    }

    /* glide handling */
    if (c.glideto !== 0) {
      c.gototune = tunehigh & 0xffff;
      c.portspeed = c.glideto;
      c.glideto = c.finetune = 0;
      return;
    }

    /* set modulator registers */
    this.setregs(0x20 + regnum, i.modMisc);
    volcalc = i.modVol;
    if (!c.nextvol || !(i.feedback & 1)) c.volmod = volcalc;
    else c.volmod = ((volcalc & 0xc0) | (((volcalc & 0x3f) * c.nextvol) >> 6)) & 0xff;

    if ((i.feedback & 1) === 1 && this.allvolume !== 0)
      this.setregs(0x40 + regnum, ((c.volmod & 0xc0) | (((c.volmod & 0x3f) * this.allvolume) >> 8)) ^ 0x3f);
    else
      this.setregs(0x40 + regnum, c.volmod ^ 0x3f);
    this.setregs(0x60 + regnum, i.modAd);
    this.setregs(0x80 + regnum, i.modSr);
    this.setregs(0xe0 + regnum, i.modWave);

    /* Set carrier registers */
    this.setregs(0x23 + regnum, i.carMisc);
    volcalc = i.carVol;
    if (!c.nextvol) c.volcar = volcalc;
    else c.volcar = ((volcalc & 0xc0) | (((volcalc & 0x3f) * c.nextvol) >> 6)) & 0xff;

    if (this.allvolume)
      this.setregs(0x43 + regnum, ((c.volcar & 0xc0) | (((c.volcar & 0x3f) * this.allvolume) >> 8)) ^ 0x3f);
    else
      this.setregs(0x43 + regnum, c.volcar ^ 0x3f);
    this.setregs(0x63 + regnum, i.carAd);
    this.setregs(0x83 + regnum, i.carSr);
    this.setregs(0xe3 + regnum, i.carWave);
    this.setregs(0xc0 + channelNumber, i.feedback);
    this.setregsAdv(0xb0 + channelNumber, 0xdf, 0); /* key off */

    const freq = FREQUENCY[tunehigh % (12 * 16)];
    const octave = ((tunehigh / (12 * 16) | 0) - 1) & 0xff;
    if (!i.glide) {
      if (!i.portamento || !c.lasttune) {
        this.setregs(0xa0 + channelNumber, freq & 0xff);
        this.setregs(0xb0 + channelNumber, (octave << 2) + 0x20 + (freq >> 8));
        c.lasttune = c.gototune = tunehigh & 0xffff;
      } else {
        c.gototune = tunehigh & 0xffff;
        c.portspeed = i.portamento;
        this.setregsAdv(0xb0 + channelNumber, 0xdf, 0x20); /* key on */
      }
    } else {
      this.setregs(0xa0 + channelNumber, freq & 0xff);
      this.setregs(0xb0 + channelNumber, (octave << 2) + 0x20 + (freq >> 8));
      c.lasttune = tunehigh & 0xffff;
      c.gototune = (tunehigh + (((i.glide + 0x80) & 0xff) - 0x80)) & 0xffff; /* set destination */
      c.portspeed = i.portamento;
    }

    if (!i.vibrato) {
      c.vibwait = c.vibspeed = c.vibrate = 0;
    } else {
      c.vibwait = i.vibdelay;
      c.vibspeed = (i.vibrato >> 4) + 2;
      c.vibrate = (i.vibrato & 15) + 1;
    }

    if (!(c.trmstay & 0xf0)) {
      c.trmwait = (i.tremwait & 0xf0) >> 3;
      c.trmspeed = i.modTrem >> 4;
      c.trmrate = i.modTrem & 15;
      c.trmcount = 0;
    }

    if (!(c.trmstay & 0x0f)) {
      c.trcwait = (i.tremwait & 15) << 1;
      c.trcspeed = i.carTrem >> 4;
      c.trcrate = i.carTrem & 15;
      c.trccount = 0;
    }

    c.arpSize = i.arpeggio & 15;
    c.arpSpeed = i.arpeggio >> 4;
    c.arpTab.set(i.arpTab);
    c.keycount = i.keyoff;
    c.nextvol = c.glideto = c.finetune = c.vibcount = c.arpPos = c.arpCount = 0;
  }
}
