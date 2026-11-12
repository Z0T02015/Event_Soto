(() => {
  "use strict";

  const EVENT_AT = Date.parse("2026-11-15T01:00:00Z"); // Nov 14, 8:00 PM in America/Lima (UTC-5)
  const DRINK_CATEGORIES = [
    "Coca-Cola: 1.5 litros o más",
    "Pepsi: 1.5 litros o más",
    "Sprite (2 litros o más) o Everness (1.5 litros o más)",
    "Guaraná (2 litros o más) o Fanta (1.5 litros o más)",
    "Inca Kola: 1.5 litros o más",
    "Jugo de naranja: 1 litro"
  ];
  const config = window.EVENT_SOTO_CONFIG || {};
  const endpoint = typeof config.appsScriptUrl === "string" ? config.appsScriptUrl.trim() : "";
  const backendReady = Boolean(endpoint && config.backendContractVerified === true);
  const form = document.querySelector("#rsvpForm");
  const registerButton = document.querySelector("#registerButton");
  const formStatus = document.querySelector("#formStatus");
  const spinButton = document.querySelector("#spinButton");
  const rouletteStatus = document.querySelector("#rouletteStatus");
  const wheel = document.querySelector("#rouletteWheel");
  const audio = document.querySelector("#partyAudio");
  const musicButton = document.querySelector("#musicButton");
  const musicIconPath = musicButton.querySelector(".play-icon path");
  const musicStatus = document.querySelector("#musicStatus");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let registered = false;
  let registrationLocked = false;
  let serverAssignment = null;
  let busy = false;
  let hasAssignment = false;
  let currentRotation = 0;
  let spinFrame = 0;
  let audioContext = null;
  let gainNode = null;

  const configuredMusicPath = typeof config.musicPath === "string" ? config.musicPath.trim() : "";
  if (configuredMusicPath) audio.src = new URL(configuredMusicPath, document.baseURI).href;
  audio.volume = 0;

  function updateCountdown() {
    const remaining = EVENT_AT - Date.now();
    if (remaining <= 0) {
      document.querySelector("#countdown").hidden = true;
      document.querySelector("#eventLive").hidden = false;
      return;
    }
    const total = Math.floor(remaining / 1000);
    document.querySelector("#days").textContent = String(Math.floor(total / 86400)).padStart(2, "0");
    document.querySelector("#hours").textContent = String(Math.floor((total % 86400) / 3600)).padStart(2, "0");
    document.querySelector("#minutes").textContent = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    document.querySelector("#seconds").textContent = String(total % 60).padStart(2, "0");
  }
  updateCountdown();
  window.setInterval(updateCountdown, 1000);

  function setBusy(value) {
    busy = value;
    registerButton.disabled = value || !backendReady || registered || registrationLocked;
    spinButton.disabled = value || hasAssignment || !backendReady || !registered || !serverAssignment;
  }
  registerButton.disabled = !backendReady;
  spinButton.disabled = true;
  if (!backendReady) {
    formStatus.textContent = "Conexión pausada: hay que actualizar y verificar la implementación de Apps Script antes de registrar invitados.";
    rouletteStatus.textContent = "La ruleta se habilita solo después de confirmar el registro y recibir la bebida del servidor.";
  }

  function validGoogleEmail(value) {
    return /^[^\s@]+@gmail\.com$/i.test(value.trim());
  }

  // Apps Script JSONP contract: callback/nombre/apellido/correo -> { ok, mensaje, bebida }.
  function sendRegistrationData({ firstName, lastName, email }) {
    if (!backendReady) return Promise.reject(new Error("Apps Script aún no está actualizado y verificado."));
    return new Promise((resolve, reject) => {
      const callbackName = `eventSoto_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const requestUrl = new URL(endpoint);
      let timeoutId;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        delete window[callbackName];
        script.remove();
      };
      window[callbackName] = (response) => {
        cleanup();
        resolve(response);
      };
      script.onerror = () => {
        cleanup();
        const error = new Error("No se pudo confirmar la respuesta de Apps Script.");
        error.registrationOutcomeUnknown = true;
        reject(error);
      };
      timeoutId = window.setTimeout(() => {
        cleanup();
        const error = new Error("Apps Script no respondió a tiempo.");
        error.registrationOutcomeUnknown = true;
        reject(error);
      }, 20000);
      requestUrl.searchParams.set("callback", callbackName);
      requestUrl.searchParams.set("nombre", firstName);
      requestUrl.searchParams.set("apellido", lastName);
      requestUrl.searchParams.set("correo", email);
      script.src = requestUrl.href;
      document.head.appendChild(script);
    });
  }

  function receiveRegistrationResponse(response) {
    if (!response || typeof response !== "object") {
      throw new Error("Apps Script devolvió una respuesta inválida.");
    }
    if (response.ok !== true) {
      const error = new Error(response.mensaje || "El servidor no confirmó el registro.");
      if (/ya tiene una entrada|correo ya|duplicad/i.test(error.message)) error.duplicateEmail = true;
      throw error;
    }
    const beverage = String(response.bebida || "").trim();
    if (!DRINK_CATEGORIES.includes(beverage)) {
      throw new Error("El registro respondió, pero la bebida del servidor no coincide con las seis categorías vigentes. Contacta al organizador antes de girar.");
    }
    return beverage;
  }

  // The current GAS assigns and returns the beverage as part of registration; this reveals
  // that saved server result only after the guest presses Spin. It does not select a category.
  async function getFinalRouletteAssignment() {
    if (!registered || !serverAssignment) throw new Error("Primero debe confirmarse el registro del servidor.");
    return serverAssignment;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!backendReady) {
      formStatus.textContent = "El registro se habilitará después de actualizar y verificar Código.gs.";
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();
    const email = values.email.trim().toLowerCase();
    if (!firstName || !lastName || !validGoogleEmail(email)) {
      formStatus.textContent = "Completa tu nombre, apellido y un correo válido de Gmail.";
      return;
    }
    setBusy(true);
    formStatus.textContent = "Enviando registro…";
    try {
      const response = await sendRegistrationData({ firstName, lastName, email });
      if (response && response.ok === true) {
        // The server has already appended the row and reserved the drink; never submit it again.
        registrationLocked = true;
        form.querySelectorAll("input").forEach((input) => { input.readOnly = true; });
      }
      serverAssignment = receiveRegistrationResponse(response);
      registered = true;
      formStatus.textContent = response.mensaje || "¡Registro confirmado!";
      rouletteStatus.textContent = "Registro confirmado. Pulsa girar para revelar tu resultado del servidor.";
      registerButton.textContent = "Registro confirmado ✓";
    } catch (error) {
      if (error.registrationOutcomeUnknown || error.duplicateEmail) {
        registrationLocked = true;
        form.querySelectorAll("input").forEach((input) => { input.readOnly = true; });
      }
      if (error.registrationOutcomeUnknown) {
        formStatus.textContent = "No llegó confirmación. Para evitar un registro duplicado, no vuelvas a enviar este correo hasta que el organizador verifique la hoja.";
      } else if (error.duplicateEmail) {
        formStatus.textContent = error.message;
      } else {
        formStatus.textContent = error.message || "Ocurrió un error. No se habilitó la ruleta.";
      }
    } finally {
      setBusy(false);
    }
  });

  function animateWheel(categoryIndex) {
    const targetAngle = (360 - categoryIndex * 60) % 360;
    if (reducedMotion.matches) {
      currentRotation = targetAngle;
      wheel.style.transform = `rotate(${currentRotation}deg)`;
      return Promise.resolve();
    }
    const currentAngle = ((currentRotation % 360) + 360) % 360;
    const alignment = (targetAngle - currentAngle + 360) % 360;
    const startRotation = currentRotation;
    const endRotation = startRotation + (6 + Math.floor(Math.random() * 3)) * 360 + alignment;
    const distance = endRotation - startRotation;
    const duration = 7600;

    // Update absolute rotation each frame. This preserves multiple full turns in all browsers,
    // unlike a single transform transition that may normalize angles such as 1800deg to 0deg.
    wheel.style.transition = "none";
    wheel.style.transform = `rotate(${startRotation}deg)`;
    void wheel.offsetWidth;
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const frame = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        let eased;
        if (progress < 0.12) {
          const accelerated = progress / 0.12;
          eased = 0.17 * accelerated * accelerated;
        } else {
          const coast = (progress - 0.12) / 0.88;
          eased = 0.17 + 0.83 * (1 - Math.pow(1 - coast, 3));
        }
        currentRotation = startRotation + distance * eased;
        wheel.style.transform = `rotate(${currentRotation}deg)`;
        if (progress < 1) {
          spinFrame = window.requestAnimationFrame(frame);
          return;
        }
        currentRotation = endRotation;
        wheel.style.transform = `rotate(${currentRotation}deg)`;
        wheel.style.transition = "";
        resolve();
      };
      spinFrame = window.requestAnimationFrame(frame);
    });
  }

  spinButton.addEventListener("click", async () => {
    if (busy || !backendReady || !registered || hasAssignment) return;
    setBusy(true);
    try {
      rouletteStatus.textContent = "Mostrando la bebida que devolvió el servidor…";
      const category = await getFinalRouletteAssignment();
      const categoryIndex = DRINK_CATEGORIES.indexOf(category);
      if (categoryIndex < 0) throw new Error("No se encontró un segmento para el resultado recibido.");
      hasAssignment = true;
      await animateWheel(categoryIndex);
      rouletteStatus.textContent = `Tu bebida asignada por el servidor: ${category}`;
    } catch (error) {
      rouletteStatus.textContent = error.message || "No se pudo completar el giro.";
    } finally {
      setBusy(false);
    }
  });

  let fadeFrame = 0;
  const musicFadeDuration = Number(config.musicFadeDurationMs) || 16000;
  function prepareAudioFade() {
    if (gainNode) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      audioContext = new AudioContextClass();
      const source = audioContext.createMediaElementSource(audio);
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      audio.volume = 1;
      return true;
    } catch {
      audioContext = null;
      gainNode = null;
      return false;
    }
  }

  function fadeMusicIn() {
    if (gainNode && audioContext) {
      gainNode.gain.cancelScheduledValues(audioContext.currentTime);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      const curve = new Float32Array(96);
      for (let index = 0; index < curve.length; index += 1) {
        curve[index] = 0.66 * Math.pow(index / (curve.length - 1), 1.65);
      }
      gainNode.gain.setValueCurveAtTime(curve, audioContext.currentTime, musicFadeDuration / 1000);
      return;
    }
    window.cancelAnimationFrame(fadeFrame);
    const startedAt = performance.now();
    const ramp = (now) => {
      if (audio.paused) return;
      const progress = Math.min(1, (now - startedAt) / musicFadeDuration);
      audio.volume = 0.66 * Math.pow(progress, 1.65);
      if (progress < 1) fadeFrame = window.requestAnimationFrame(ramp);
    };
    fadeFrame = window.requestAnimationFrame(ramp);
  }

  musicButton.addEventListener("click", async () => {
    if (!audio.getAttribute("src")) {
      musicStatus.textContent = "Coloca tu archivo MP3 local en assets/music/ y configura su ruta en config.js.";
      return;
    }
    if (audio.paused) {
      try {
        if (prepareAudioFade()) {
          await audioContext.resume();
          gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        } else {
          audio.volume = 0;
        }
        await audio.play();
        fadeMusicIn();
        musicButton.setAttribute("aria-pressed", "true");
        musicButton.setAttribute("aria-label", "Pausar música");
        musicIconPath.setAttribute("d", "M7 5h4v14H7zM15 5h4v14h-4z");
        document.querySelector(".music-player").classList.add("music-playing");
      } catch {
        musicStatus.textContent = "No se pudo reproducir el archivo. Comprueba que la ruta de música en config.js sea correcta.";
      }
    } else {
      window.cancelAnimationFrame(fadeFrame);
      if (gainNode && audioContext) {
        gainNode.gain.cancelScheduledValues(audioContext.currentTime);
        gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.025);
      }
      audio.pause();
      if (!gainNode) audio.volume = 0;
      musicButton.setAttribute("aria-pressed", "false");
      musicButton.setAttribute("aria-label", "Reproducir música");
      musicIconPath.setAttribute("d", "m8 5 12 7-12 7V5Z");
      document.querySelector(".music-player").classList.remove("music-playing");
    }
  });

  audio.addEventListener("error", () => {
    musicStatus.textContent = "No se encontró el MP3. Revisa musicPath en config.js y la ruta dentro de assets/music/.";
  });
})();
