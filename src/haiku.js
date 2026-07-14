// A small pool of haiku surfaced when the wanderer rests. Original lines, calm,
// in keeping with the moonlit, goalless walk. No profit — just a moment.
export const HAIKU = [
  "the path forgets\nwhere it was going —\nso do i",
  "moonlight on water\nno one asks\nwhere it has been",
  "a bell, far off —\nthe silence after\nis the gift",
  "cold grass bends\nunder a wind\nthat has no name",
  "i counted the stars\nuntil the counting\nlost its meaning",
  "the lantern sways\nkeeping time\nwith nothing",
  "footprints fill\nwith blue shadow —\nthe hills breathe",
  "somewhere a door\nopens onto\nmore evening",
  "the river carries\nthe moon, and\nasks for nothing",
  "i sat down\nand the whole sky\nkept walking",
  "snow on the far peak\nremembers a warmth\nit never had",
  "an old stone, warm —\nsomeone rested here\na thousand years ago",
  "no destination\nis the softest\nplace to arrive",
  "the dark between stars\nis also\nlight, resting",
];

export function randomHaiku() {
  return HAIKU[Math.floor(Math.random() * HAIKU.length)];
}
