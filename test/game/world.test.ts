import { describe, expect, it } from 'vitest';
import { createGameWorld, ENEMY_NUM, WEAP_NUM, windowTextSamples, shapeFile } from '../../src/game/world';
import { V_DANGER } from '../../src/audio/ids';

describe('createGameWorld', () => {
  it('reproduces C static initialisers', () => {
    const g = createGameWorld();
    expect(Array.from(g.config.inputDevice)).toEqual([1, 2]);
    expect(g.config.fxPlayVol).toBe(4);
    expect(g.varz.shadowYDist).toBe(10);
    expect(g.config.trentWin).toBe(false);
    expect(g.demo.demoNum).toBe(0);
    expect(g.items.weapons).toHaveLength(WEAP_NUM + 1);
    expect(g.items.enemyDat).toHaveLength(ENEMY_NUM + 1);
    expect(g.enemies.enemy).toHaveLength(100);
    expect(g.enemyShots.enemyShot).toHaveLength(60);
    expect(g.explosions.explosions).toHaveLength(200);
    expect(g.explosions.repExplosions).toHaveLength(20);
    expect(g.explosions.superpixels).toHaveLength(101);
    expect(g.playerShots.playerShotData).toHaveLength(82);
    expect(g.playerShots.shotAvail).toHaveLength(81);
    expect(g.events.eventRec).toHaveLength(2500);
    expect(g.map.megaData1.mainmap).toHaveLength(300 * 14);
    expect(g.map.megaData2.mainmap).toHaveLength(600 * 14);
    expect(g.map.megaData3.mainmap).toHaveLength(600 * 15);
    expect(g.map.megaData1.mainmap[0]).toBe(-1);
  });
  it('static tables match varz.c / sndmast.c / lvlmast.c', () => {
    const { tables: t } = createGameWorld();
    expect(t.SANextShip).toEqual([3, 8, 6, 2, 5, 1, 4, 10, 9, 7, 3]);
    expect(t.SAWeapon[6]).toEqual([40, 38, 37, 41, 36]);
    expect(t.PGR).toHaveLength(21);
    expect(t.PGR.slice(0, 8)).toEqual([4, 1, 2, 3, 41 - 21, 57 - 21, 73 - 21, 89 - 21]);
    expect(t.PGR[16]).toBe(73 - 21);
    expect(t.linkGunWeapons).toHaveLength(38);
    expect(t.linkGunWeapons[8]).toBe(444);
    expect(t.chargeGunWeapons[25]).toBe(558);
    expect(t.optionSelect[15]).toEqual([[15, 15], [15, 16], [15, 16]]);
    expect(t.keyboardCombos).toHaveLength(26);
    expect(t.keyboardCombos[5]).toEqual([6, 7, 5, 8, 6, 7, 5, 112]);
    expect(t.shipCombos).toHaveLength(19);
    expect(t.shipCombos[7]).toEqual([10, 3, 5]);
    expect(t.superTyrianSpecials).toEqual([1, 2, 4, 5]);
    expect(t.randomEnemyLaunchSounds).toEqual([13, 6, 26]);
    expect(t.specialArcadeWeapon).toHaveLength(60);
    expect(t.specialArcadeWeapon[12]).toBe(44);
    expect(windowTextSamples).toHaveLength(9);
    expect(windowTextSamples[0]).toBe(V_DANGER);
    expect(shapeFile).toHaveLength(36);
    expect(shapeFile[0]).toBe('2');
    expect(shapeFile[35]).toBe('%');
  });
});

describe('Player.lives alias', () => {
  it('is a view onto items.weapon[p].power', () => {
    const g = createGameWorld();
    const p = g.players[0];
    p.items.weapon[0].power = 7;
    expect(p.lives).toBe(7);
    p.lives = 3;
    expect(p.items.weapon[0].power).toBe(3);
    const q = g.players[1];
    q.items.weapon[1].power = 9;
    expect(q.lives).toBe(9);
    expect(g.players[0].items.weapon[1].power).toBe(0);
  });
});
