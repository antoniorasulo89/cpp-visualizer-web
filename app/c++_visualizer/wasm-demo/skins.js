"use strict";
(() => {
  const names = {
    laboratorio: "Laboratorio",
    mappa: "Mappa",
    segnali: "Segnali",
    classica: "Classica",
  };
  const key =
    "dentro-il-codice-skin-v1:" + new URL(".", location.href).pathname;
  const valid = (value) => Object.hasOwn(names, value);
  let skin = "laboratorio";
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) skin = saved;
  } catch {
    // The selector still works when storage is unavailable.
  }
  document.documentElement.dataset.skin = skin;
  document.addEventListener("DOMContentLoaded", () => {
    const settings = document.getElementById("settings");
    const status = document.getElementById("skin-status");
    const radios = settings.querySelectorAll('input[name="skin"]');
    for (const radio of radios) radio.checked = radio.value === skin;
    status.textContent = "Skin attuale: " + names[skin] + ".";
    settings.addEventListener("change", (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) ||
        target.name !== "skin" ||
        !valid(target.value)
      )
        return;
      skin = target.value;
      document.documentElement.dataset.skin = skin;
      try {
        localStorage.setItem(key, skin);
        status.textContent =
          "Skin " + names[skin] + " applicata e salvata su questo dispositivo.";
      } catch {
        status.textContent =
          "Skin " +
          names[skin] +
          " applicata. Salvataggio non disponibile: la scelta vale per questa visita.";
      }
    });
    const toggle = document.querySelector(".settings-link");
    settings.addEventListener("toggle", () =>
      toggle.setAttribute("aria-expanded", String(settings.open)),
    );
    toggle.addEventListener("click", () => {
      settings.open = !settings.open;
      if (settings.open) settings.querySelector("input:checked").focus();
    });
    // Move the existing controls, preserving their event handlers and editor state.
    const flowPane = document.getElementById("flow-pane");
    const inspector = flowPane.querySelector(".flow-inspector");
    const palette = flowPane.querySelector(".flow-palette");
    if (inspector && palette) {
      const tools = document.createElement("div");
      tools.className = "flow-tools";
      tools.setAttribute("role", "group");
      tools.setAttribute("aria-label", "Strumenti del diagramma");
      flowPane.insertBefore(tools, flowPane.querySelector(".flow-canvas"));
      tools.append(palette, inspector);
    }
  });
})();
