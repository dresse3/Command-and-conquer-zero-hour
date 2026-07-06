# Zero Hour RTS

En original real-time strategi-engine i browseren, inspireret af *Command & Conquer: Generals — Zero Hour*.
Skrevet i TypeScript med Canvas 2D. Kører identisk på **Windows og macOS** (og Linux) — alt hvad der kræves er en modern browser.

> Dette er et selvstændigt, originalt projekt. Det indeholder **ingen** assets, kode eller data fra EA's spil.
> Faktioner, enheder og grafik er egne. Mekanikkerne er genskabt som design, ikke kopieret.

## Kør spillet

```bash
npm install
npm run dev
```

Åbn den viste URL (typisk `http://localhost:5173`) i din browser.

Byg en statisk version til udgivelse:

```bash
npm run build      # output i dist/ — kan hostes hvor som helst
npm run preview
```

## Styring

| Input | Handling |
|-------|----------|
| **WASD / piletaster / skærmkant** | Panorér kameraet |
| **Musehjul** | Zoom ind/ud |
| **Venstre-klik + træk** | Marker enheder (box-select) |
| **Venstre-klik** | Marker enkelt enhed |
| **Shift + klik** | Tilføj til markering |
| **Højre-klik** | Flyt · angrib fjende · send harvester til supply |
| **Esc** | Fjern markering |
| **R / T / H** | Byg Ranger · Raptor Tank · Harvester |

## Hvad er implementeret (v0.1)

- **Tile-baseret kort** (60×60) med terræn og klippeforhindringer
- **A\* pathfinding** (8-retninger, undviger forhindringer og bygninger)
- **Kamera** med pan, edge-scroll og zoom
- **Enheder:** Ranger (infanteri), Raptor Tank, Harvester
- **Kamp:** automatisk mål-opsamling, projektiler, health bars, død
- **Økonomi:** harvestere samler fra supply-felter og afleverer i Command Center
- **Produktion:** byg-kø med progress, rally point
- **Fjende-AI:** bygger økonomi + hær og angriber din base i bølger
- **Sejr/nederlag:** ødelæg fjendens Command Center — eller mist din egen

## Arkitektur

```
src/
  main.ts        Bootstrap + game loop (requestAnimationFrame)
  config.ts      Balance, faktioner, enheds-/bygningsdata
  grid.ts        Tile-grid + A* pathfinding
  camera.ts      Pan / zoom / world<->screen
  input.ts       Mus + tastatur, selection box
  entities.ts    Unit, Building, SupplyField, Projectile
  ai.ts          Fjendens beslutningslogik
  game.ts        Orkestrering: state, update, kommandoer, økonomi, win/lose
  renderer.ts    Al tegning + HUD
  types.ts       Delte typer og WorldApi-interface
```

## Roadmap (næste skridt)

- [ ] Flere bygningstyper (barracks, war factory, forsvarstårne)
- [ ] Supply Depot som ekstra afleveringspunkt
- [ ] Fog of war + minimap
- [ ] Faktions-asymmetri og "general powers"
- [ ] Bedre sprite-grafik / lyd
- [ ] Gruppe-hotkeys (Ctrl+1) og attack-move (A)
- [ ] Pak som desktop-app (Tauri/Electron) for native Win/Mac

## Licens

Original kode. Ikke tilknyttet eller godkendt af Electronic Arts.
