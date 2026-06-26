# Graphics & Detail Plan — supervuoto-wanderer

Goal: raise perceived quality while staying true to the calm **soft low-poly 3D**
look (the abeto reference is soft 3D, not sprites). Sprites are used as *accents*
(density, particles, distant filler), never as a full reskin — a pixel/2.5D pivot
would be a different game and lose the serene wander feel.

Everything below must stay **infinite-terrain & perf friendly** (instancing,
LOD, frustum culling, wrap-around recycling).

---

## Phase 1 — Lighting & post (cheapest, biggest jump)
- [x] **Bloom** — soft glow on emissive pixels (lanterns, rings, crystals, aurora,
  waveform, moon). `UnrealBloomPass` before the LOFI pass; toggle + strength in
  Settings, persisted. **SHIPPED.**
- [x] **ACES tonemapping + exposure** — `renderer.toneMapping = ACESFilmicToneMapping`
  with an **Exposure** slider in Settings (persisted). Filmic, richer color instead
  of flat sRGB; pairs with bloom. **SHIPPED.**
- [ ] **Contact / blob shadows** — cheap soft shadow under the sage, trees,
  structures so nothing floats. (Or one shadow-mapped moonlight if budget allows.)
- [ ] **SSAO** — ambient occlusion in valleys/crevices for depth.

## Phase 2 — Density via instancing (where sprites help)
- [ ] **Instanced grass / flowers / reeds** (`InstancedMesh`, low-poly blades or
  alpha billboards) scattered on the ground, swaying — the single biggest "alive"
  upgrade. Wrap/recycle around the player like existing props.
- [ ] **Soft textured particles** replacing point dots: fireflies, pollen, plus
  biome weather — **snow** in the snowy biome, **blowing sand** in the desert.
- [ ] **Birds / distant silhouettes / cloud cards** as billboards.
- [ ] **Footstep dust puffs** when the sage walks (sprite/particle bursts).

## Phase 3 — Materials & surfaces
- [ ] **Triplanar terrain texturing** (rock striations, snow sparkle, sand grain)
  + **vertex AO** darkening valleys — far more surface detail than the grain map.
- [ ] **Better foliage** — low-poly canopies with alpha, or crossed-quad billboard
  trees; biome-correct species.
- [ ] **Water upgrade** — reflections/refraction, shoreline foam, subtle caustics.

## Phase 4 — Atmosphere & content
- [ ] **Weather per biome** tied to the day/night arc (snowfall, sandstorm, drizzle).
- [ ] **God rays / light shafts** from the moon/sun.
- [ ] **Landmarks / shrines** that react when reached (optional, keeps it goalless).
- [ ] **Spatial audio** for water/lanterns; biome-filtered ambience.
- [ ] **Shareable world seed** so a landscape is reproducible.

## Cross-cutting: performance
- [ ] **LOD** for props (full → billboard → cull by distance/fog).
- [ ] **Frustum culling** for instanced props; cap instance counts; auto-scale
  density + pixel ratio from measured FPS.

---

### Recommended order
Finish **Phase 1** (ACES → contact shadows → SSAO) for the fast polish jump,
then **Phase 2 instanced grass + weather particles** for the "alive" feeling,
then Phase 3/4 as content. Each phase is a candidate for a ruflo workflow
(single-writer on shared files like `pastel.js`/`main.js`, parallel new modules,
build-gated — same rollout pattern as IMPLEMENTATION-PLAN.md).
