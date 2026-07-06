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
| **Piletaster / skærmkant** | Panorér kameraet |
| **Musehjul** | Zoom ind/ud |
| **Klik på minimap** | Hop kameraet · (højre-klik = kommandér dertil) |
| **Venstre-klik + træk** | Marker enheder (box-select) |
| **Venstre-klik på bygning** | Vælg bygning → dens byg-menu vises nederst |
| **Shift + klik** | Tilføj til markering |
| **Højre-klik** | Flyt · angrib fjende · send harvester til supply |
| **A** derefter klik | Attack-move til punkt |
| **Ctrl + 1-9** | Gem kontrolgruppe · **1-9** vælg gruppe |
| **Byg-hotkeys** (når bygning valgt) | fx R/E = infanteri, T/Y = køretøjer, 1-5 = strukturer |
| **Shift under placering** | Bliv i placeringstilstand (byg flere) |
| **Esc** | Annullér placering / fjern markering |

## Hvad er implementeret (v0.2)

- **Tile-baseret kort** (60×60) med terræn og klippeforhindringer
- **A\* pathfinding** (8-retninger, undviger forhindringer og bygninger)
- **Kamera** med pan, edge-scroll, zoom og **minimap** med klik-navigation
- **Base-building:** placér Power Plant, Barracks, War Factory, Supply Depot og Gun Turret med ghost-preview
- **Strøm-system:** bygninger kræver strøm; brownout slukker produktion og forsvar
- **Produktionshierarki:** Barracks → infanteri, War Factory → køretøjer, Command Center → strukturer
- **Enheder:** Ranger, Rocketeer (anti-tank), Raptor Tank, Artillery (splash), Harvester
- **Kamp:** auto-targeting, projektiler, splash-skade, forsvarstårne, health bars
- **Økonomi:** harvestere samler fra supply-felter og afleverer i Command Center / Supply Depot
- **Kommando:** kontrolgrupper (Ctrl+1-9), attack-move (A)
- **Fjende-AI:** bygger økonomi + hær fra barracks/factory og angriber i bølger
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

- [x] Flere bygningstyper (barracks, war factory, forsvarstårne)
- [x] Supply Depot som ekstra afleveringspunkt
- [x] Minimap med klik-navigation
- [x] Gruppe-hotkeys (Ctrl+1-9) og attack-move (A)
- [ ] Fog of war
- [ ] Faktions-asymmetri og "general powers" / superweapons
- [ ] Bedre sprite-grafik / lyd
- [ ] Smartere AI (rebuild, tech-op, angreb på svage punkter)
- [ ] Pak som desktop-app (Tauri/Electron) for native Win/Mac

## Licens

Original kode. Ikke tilknyttet eller godkendt af Electronic Arts.
