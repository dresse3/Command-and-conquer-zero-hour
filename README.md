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
| **Z / X / C** | Lås op / affyr general power (kræver ★ promotion points) |
| **K** eller SELL-knap | Sælg valgt bygning (50% refusion) |
| **Shift under placering** | Bliv i placeringstilstand (byg flere) |
| **Esc** | Annullér placering / power / fjern markering |

## Nyt i v0.5 — finpudsning & balance

- **Promotion points:** general powers er ikke længere gratis. Du optjener point ved at ødelægge fjendens enheder/bygninger (vist som ★ i toppen), og bruger dem til at **låse powers op**. Artillery Barbage dukker altså ikke op efter 10 sekunder — den skal fortjenes. AI'en spiller efter samme regler.
- **Rettet tab-betingelse:** du taber først når **alle** dine bygninger er væk — ikke ved tab af Command Center alene. Du kan nu overleve og komme igen selv uden hovedbasen.
- **Sælg bygninger:** vælg en bygning og klik **SELL** (eller tryk **K**) for 50% refusion — nyttigt til at flytte base eller redde økonomien.
- **Smartere AI:** går ikke længere passiv hvis dens Command Center falder — den kæmper videre fra sine øvrige bygninger og optjener/​bruger sine egne powers.

## Nyt i v0.4 — spil-dybde

- **Fog of war:** kortet starter uudforsket; dine enheder/bygninger afslører terræn. Fjender skjules uden for dit synsfelt, og du "husker" udforskede områder i tåge
- **General Powers / superweapons** (oplades over tid, aktiveres via HUD-knapper eller Z/X/C):
  - **Artillery Barrage** — regn af granater over et målområde
  - **Airstrike** — jetjager stryger hen over målet og bomber
  - **Reinforcements** — tilkald en gruppe enheder øjeblikkeligt
- **Veterangrader:** enheder der dræber fjender stiger i rang (rookie → veteran → elite) med bonus til skade, HP og selvhealing — vist med chevroner
- **Smartere AI:** genopbygger strøm, bygger forsvarstårne, forsvarer basen når du angriber, og bruger sin egen artilleri-power mod dine styrker

## Nyt i v0.3 — grafik & lyd

- **Ørkengrafik:** sandpalette med procedurel terræn-variation, klippeformationer og skygger under alle enheder/bygninger
- **Detaljerede enheder:** tanks med bælter og **roterende tårn** der sigter mod målet, artilleri med langt løb, soldater med våben, harvester med skovl
- **Detaljerede bygninger:** bevel-skygger, ikoner pr. type, flammer/røg når livet er lavt, tydelig OFFLINE-markering uden strøm
- **Partikeleffekter:** eksplosioner (ild + røg + murbrokker), mundingsild, gnister ved træffere, støv ved byggeri
- **Camera shake** ved store eksplosioner, tracer-spor på projektiler, rally-linje på valgt bygning
- **Syntetiseret lyd** (Web Audio, ingen filer): skud (gevær/raket/kanon), eksplosioner, byg-færdig, placering, markering, low-power-advarsel, sejr/nederlag-fanfare

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
  entities.ts    Unit, Building, SupplyField, Projectile (+ veterancy)
  ai.ts          Fjendens beslutningslogik
  fog.ts         Synlighedskort (fog of war)
  powers.ts      General powers / superweapons
  effects.ts     Partikelsystem
  audio.ts       Syntetiseret lyd (Web Audio)
  hud.ts         HUD-layout, knap-hittest, minimap-mapping
  game.ts        Orkestrering: state, update, kommandoer, økonomi, win/lose
  renderer.ts    Al tegning + HUD
  types.ts       Delte typer og WorldApi-interface
```

## Roadmap (næste skridt)

- [x] Flere bygningstyper (barracks, war factory, forsvarstårne)
- [x] Supply Depot som ekstra afleveringspunkt
- [x] Minimap med klik-navigation
- [x] Gruppe-hotkeys (Ctrl+1-9) og attack-move (A)
- [x] Partikeleffekter, camera shake og syntetiseret lyd
- [x] Ørkengrafik med skygger og detaljerede enheder/bygninger
- [x] Fog of war
- [x] General powers / superweapons
- [x] Veterangrader for enheder
- [x] Smartere AI (rebuild, forsvar, brug af powers)
- [ ] Faktions-asymmetri (flere spilbare sider)
- [ ] AI-genererede sprites (foto-realistisk løft)
- [ ] Pak som desktop-app (Tauri/Electron) for native Win/Mac

## Licens

Original kode. Ikke tilknyttet eller godkendt af Electronic Arts.
