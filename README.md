# EVENT SOTO — Birthday Party

Mobile-first static invitation for GitHub Pages, built with HTML, CSS, and vanilla JavaScript.

## Run locally

From this folder, run:

```bash
npm run dev
```

Then open `http://127.0.0.1:5173`. The development server uses Node's built-in modules and installs no npm packages. Stop it with `Ctrl+C`.

## Project files

- `index.html` — page structure, event details, private registration form, roulette, and audio controls.
- `styles.css` — responsive neon theme, motion preferences, and component layout.
- `app.js` — Lima event countdown, client-side input checks, audio controls, and the Apps Script request adapter.
- `config.js` — Apps Script deployment URL and local frontend settings. No credentials belong here.
- `assets/images/dj-hero.png` — original hero artwork.
- `assets/music/` — contains the configured local MP3; its exact name is in the music section below.

## Local music

The player is configured to use the MP3 already in `assets/music/`:

`assets/music/M U S A E L E V Á (Live Version, Intro Work) - Omar Courtz (((ousi))) - copia.mp3`

To use a different song, put the MP3 in `assets/music/` and change `musicPath` in `config.js` to its path relative to the project root. The visitor must press the play button; audio never starts automatically. Playback fades from silence to a comfortable level over 16 seconds. Pausing preserves the current playback position. Resuming starts a fresh fade-in from silence without restarting the track.

## Roulette and registration connection

The previous random test mode has been removed. The roulette is locked until Apps Script confirms a successful registration and supplies the assigned beverage. The existing script assigns the beverage during registration; the spin button only reveals and animates that server result. A duplicate or failed registration cannot enable the wheel.

The supplied Apps Script uses JSONP with GET parameters `callback`, `nombre`, `apellido`, and `correo`, and responds with `ok`, `mensaje`, and `bebida`. The frontend adapter in `app.js` matches that contract. The deployment URL is configured in `config.js` under `appsScriptUrl`. The owner confirmed that the latest deployed script now has the six agreed categories in `CATEGORIAS`.

`backendContractVerified: true` is enabled based on that confirmation. Each registration response is checked against the six expected category labels before the wheel can be enabled. Live checks returned JSONP for empty-field rejection, one successful test registration with `Coca-Cola: 1.5 litros o más`, and a duplicate rejection with `bebida: null`. The successful test created one sheet row and reserved that category; the duplicate check did not create another row.

The earlier pasted source used `BEBIDAS` and had Sprite/Everness as separate values with Guaraná/Fanta absent; the owner says this has since been corrected in the deployed `CATEGORIAS` list. The earlier source also showed a script lock and duplicate-email check around row creation.

Required category rules:

1. `Coca-Cola: 1.5 litros o más`
2. `Pepsi: 1.5 litros o más`
3. `Sprite (2 litros o más) o Everness (1.5 litros o más)`
4. `Guaraná (2 litros o más) o Fanta (1.5 litros o más)`
5. `Inca Kola: 1.5 litros o más`
6. `Jugo de naranja: 1 litro`

The named frontend integration steps are `sendRegistrationData()`, `receiveRegistrationResponse()`, and `getFinalRouletteAssignment()` in `app.js`.

The current JSONP GET transport sends name, surname, and email in the request URL. This matches the provided `doGet` implementation but means personal details are part of the HTTPS request URL at Google. A POST endpoint would avoid that URL exposure, but would require a corresponding Apps Script change and a verified cross-origin response strategy.

## Publish

The site is static and has no Node.js runtime dependency. After the Apps Script adapter has been verified, publish the repository with GitHub Pages from the chosen branch and folder. Keep the Google Sheet private and never commit tokens or credentials.
