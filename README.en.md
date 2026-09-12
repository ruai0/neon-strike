<div align="center">

# NEON STRIKE

**A neon wave-survival roguelike FPS, playable in your browser.**

[中文](README.md) · [English](README.en.md)

Built with **TypeScript + Three.js + Vite + ws**. Pure browser FPS — no install, no engine, no asset packs. Procedural synthesis for both graphics and sound.

---

## Highlights

- 6 enemy types & 3-phase bosses, endless scaling waves
- **Six procedural random layers** for replayability
- Roguelite upgrades (rarity tiers + cursed trades)
- 9 weapons, each with a unique mechanic (beam, chain-lightning, homing, flamethrower…)
- Weapon affixes & enemy elite affixes (color-coded threat auras)
- 3 solo modes: Endless / Survival / Speed-Clear
- Daily seeded challenge with local best
- LAN multiplayer: co-op survival & PvP deathmatch via room codes
- Meta-progression: rank, armory, lifetime stats, achievements

---

## Quick Start

```bash
npm install
npm run dev      # open http://localhost:5173
```

- `npm run dev` also starts the LAN WebSocket server (port 3001)
- Production: `npm run build`; standalone LAN server: `npm run server`

### LAN multiplayer
1. `npm run dev`
2. Copy your LAN address from the main menu (click to copy), e.g. `http://192.168.1.33:5173`
3. Friends on the same network open that URL and join via a 4-letter room code
4. Allow Node.js through your firewall for ports **5173** and **3001** on first run

---

## Controls

```
WASD move · Mouse look / left-click shoot · Right-click aim
1-9 / Q switch weapon · R reload · G grenade · C dash
Shift sprint · Space jump · F fullscreen · Esc pause
```

---

## Tech Stack

- TypeScript (strict) — all game logic
- Three.js — WebGL + UnrealBloom post-processing
- Vite — dev server & build (serves the LAN share endpoint)
- ws — LAN WebSocket multiplayer server
- Web Audio API — procedural SFX, zero audio assets

```
neon-strike/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.ts        # core: render, shooting, waves, shop, affixes, daily
│   ├── enemies.ts     # 6 enemy models + elite affixes
│   ├── net.ts         # WebSocket client
│   ├── audio.ts       # procedural SFX
│   ├── particles.ts   # particle pool
│   └── ui.ts          # floaters, minimap, tags
└── server/
    └── index.mjs      # LAN server (co-op & PvP rooms)
```

---

## Design Notes

Replayability comes from **six non-overlapping random layers** — each alters a different axis of play, so runs almost never repeat:

1. **Upgrades** — per-run stat curve (rarity-tiered cards)
2. **Enemies** — wave composition + elite affixes
3. **Weapons** — which mechanics you have
4. **Weapon affixes** — identity of each weapon instance
5. **Wave events** — mid-wave tempo shifts
6. **Maps** — spatial layout & theme

References: Risk of Rain 2 elites, Slay the Spire daily climb, CS-style weapon economy.

---

## License

**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**

NonCommercial use only. You may modify and share the material with attribution, but commercial use is prohibited.

- Full text: https://creativecommons.org/licenses/by-nc/4.0/legalcode