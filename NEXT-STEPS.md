# Next-Step Ideas — supervuoto-wanderer

Where the wander could go *after* the tiers in `ANALYSIS.md` (reactivity ✅,
magnificence ✅, richer world ✅, wonders started). These are fresh directions,
grouped by theme, each with a rough size (S/M/L) and why it fits the calm,
goalless, "super-void" spirit. Nothing here adds score or obligation.

---

## A. More wonders & encounters  · the cheapest wins
The `wonders.js` system is built to scale — each new gem is one small builder.
- **Pour in the backlog** `S each` — torii tunnel, moon pavilion, dry shipwreck,
  sleeping giant, field of bells, lighthouse, the lone door, the well, cairns,
  statue garden, fallen star, frozen lake, bridge to nowhere, lantern grove,
  observatory, hot spring, **singing stone** (harmonizes a drone with your track).
- **Fleeting encounters** `M` — the fox that leads you and fades, a ghost pilgrim
  passing on the path, a kite with no owner, a prayer slip you can read.
- **The Rest verb** `M` — sit near any shrine/bench → HUD fades, the sky runs a
  short time-lapse, a **haiku** appears, then you rise. The signature "do nothing,
  gain nothing, feel something" moment.

## B. Words & tiny stories  · atmosphere, near-zero perf
- **Haiku / fragment pool** `S` — a hand-written set of short lines surfaced at
  rests, wells, slips. Occasionally one references the biome or the hour.
- **Prayer slips as a soft thread** `M` — scattered notes that, read across a long
  walk, hint at other wanderers who came before. Story without a plot.

## C. Make a wander shareable  · turns solitude into quiet connection
- **World seed in the URL** `M` — `?seed=…` fixes the terrain, biomes, wonder
  placement. Reproducible landscapes you can send ("walk *my* valley").
- **Postcards** `S` — extend photo mode with a caption + the seed/coords stamped
  in a corner, so a screenshot is a place someone else can visit.
- **Ghost paths** `L` — opt-in: a faint trail where a previous wanderer walked
  (yours from last session via localStorage first; others later via a tiny
  backend). Presence without interaction.

## D. Sound as a place  · deepen immersion
- **Spatial audio** `M` — position waterfalls, bells, lanterns in a stereo/HRTF
  field so you *hear* where a wonder is before you see it (pairs with the
  curiosity chip). Uses `PannerNode`.
- **Biome ambience beds** `M` — a low wind in the snow, cicada-shimmer in the
  desert, water lapping near lakes — filtered by the day/night arc, layered under
  the music (or under the generative pad).
- **The world sings back** `S` — small resonances (singing stone, field of bells)
  that add notes *in key with the current track's energy*, tying wonders to the
  reactivity engine.

## E. Time, weather & seasons  · long-arc variety
- **Weather ↔ day/night arc** `S` — bias snowfall/mist/sandstorm by the hour so
  dawn clears, deep night thickens (the hooks already exist).
- **Seasons over very long walks** `M` — palette + foliage drift across a much
  slower cycle than the 30-min night, so an hour-long mix ages the world.
- **Rare skies** `S` — an occasional double-moon, a great comet night, a blood
  moon — keyed to seldom-hit thresholds so they feel like luck.

## F. Companions & life  · the world feels inhabited
- **Flocking fauna** `M` (last Tier-3 item) — birds/fish that drift and scatter
  on strong beats.
- **The wisp, evolved** `M` — the journey wisp could learn your habits (lingers
  where you linger, brightens near wonders) — a companion, not a pet with stats.

## G. Craft & accessibility  · protect the feel everywhere
- **FPS auto-scaler** `M` — measure frame time, dial grass/particle counts + pixel
  ratio so low-end phones stay smooth and strong machines stay lush.
- **Mobile pass** `M` — verify grass/weather/wonder counts on real devices; make
  the interact/curiosity UI thumb-friendly.
- **"Quiet mode"** `S` — one toggle that softens *everything* (reactivity, weather,
  events) for pure meditative walking.

---

## Recommended near-term path
1. **Rest verb + haiku pool** (A/B) — the strongest expression of the whole idea,
   small, and it makes every shrine/bench meaningful.
2. **3–4 more wonders** (A) — fast, and variety is what "a lot of mini-quests"
   needs; include the **singing stone** to tie wonders back to the audio work.
3. **World seed + postcards** (C) — turns the wander into something shareable
   without a backend.
4. **Spatial audio + a biome ambience bed** (D) — the biggest immersion jump left.

Everything stays gated by `PERF` + `reduceMotion`, and nothing introduces a goal,
a score, or a fail state. The point remains: walk, notice, feel — then keep walking.
