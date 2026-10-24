import { inputDescription, validateInput } from "./input-values.js";

export class InputDialog {
  constructor(send, stop) {
    this.dialog = document.getElementById("input-dialog");
    this.field = document.getElementById("input-value");
    this.error = document.getElementById("input-error");
    this.send = send;
    this.stop = stop;
    this.request = null;
    this.flight = null;
    this.settled = Promise.resolve();
    this.dialog.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.request || this.field.readOnly) return;
      const error = validateInput(this.field.value, this.request);
      if (error) {
        this.showError(error);
        return;
      }
      this.submit(false);
    });
    document.getElementById("input-eof").onclick = () => this.submit(true);
    document.getElementById("input-cancel").onclick = stop;
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      stop();
    });
  }
  show(request) {
    this.animation?.cancel();
    this.request = request;
    this.field.value = "";
    this.unlock();
    document.getElementById("input-question").textContent = request.name
      ? `Valore per ${request.name}`
      : "Input del programma";
    document.getElementById("input-prompt").textContent =
      request.prompt || "Il programma attende un dato.";
    document.getElementById("input-type").textContent =
      `Inserisci un ${inputDescription(request)}.${request.line ? ` Riga ${request.line}.` : ""}`;
    this.field.inputMode = [1, 6].includes(request.kind)
      ? "numeric"
      : request.kind === 2
        ? "decimal"
        : "text";
    this.error.textContent = "";
    this.field.removeAttribute("aria-invalid");
    this.target(request.name)?.classList.add("input-target");
    this.dialog.showModal();
    this.field.focus();
  }
  submit(eof) {
    if (!this.request || this.field.readOnly) return;
    this.field.readOnly = true;
    this.dialog.querySelector('[type="submit"]').disabled = true;
    document.getElementById("input-eof").disabled = true;
    this.send({
      type: "input",
      id: this.request.id,
      value: this.field.value,
      eof,
    });
  }
  unlock() {
    this.field.readOnly = false;
    this.dialog.querySelector('[type="submit"]').disabled = false;
    document.getElementById("input-eof").disabled = false;
  }
  showError(text) {
    this.unlock();
    this.error.textContent = text;
    this.field.setAttribute("aria-invalid", "true");
    this.field.focus();
  }
  accepted(message) {
    if (!this.request || message.id !== this.request.id) return;
    if (!message.eof)
      this.flight = {
        name: this.request.name,
        value: this.field.value || '""',
        rect: this.field.getBoundingClientRect(),
      };
    this.request = null;
    this.dialog.close();
    document
      .querySelectorAll(".input-target")
      .forEach((el) => el.classList.remove("input-target"));
  }
  target(name) {
    return [...document.querySelectorAll("#memory .cell")]
      .filter(
        (el) =>
          name === el.dataset.variable ||
          name?.startsWith(el.dataset.variable + "["),
      )
      .sort((a, b) => b.dataset.variable.length - a.dataset.variable.length)[0];
  }
  transfer() {
    if (!this.flight) return;
    const flight = this.flight,
      target = this.target(flight.name);
    if (!target) return;
    this.flight = null;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    const arrival = () => {
      this.target(flight.name)?.classList.add("input-arrived");
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      arrival();
      return;
    }
    const value = document.createElement("span");
    value.className = "input-flight";
    const label = document.createElement("small"),
      number = document.createElement("strong");
    label.textContent = flight.name;
    number.textContent =
      flight.value.length > 40 ? flight.value.slice(0, 37) + "…" : flight.value;
    value.append(label, number);
    value.setAttribute("aria-hidden", "true");
    document.body.append(value);
    const to = target.getBoundingClientRect(),
      from = flight.rect;
    value.style.left = `${from.left + from.width / 2}px`;
    value.style.top = `${from.top + from.height / 2}px`;
    const animation = value.animate(
      [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        {
          transform: "translate(-50%,-50%) scale(1.08)",
          opacity: 1,
          offset: 0.2,
        },
        {
          transform: `translate(calc(-50% + ${to.left + to.width / 2 - from.left - from.width / 2}px),calc(-50% + ${to.top + to.height / 2 - from.top - from.height / 2}px)) scale(.85)`,
          opacity: 1,
        },
      ],
      { duration: 850, easing: "cubic-bezier(0.4,0,0.2,1)" },
    );
    target.classList.add("input-receiving");
    this.animation = animation;
    const settled = animation.finished
      .then(async () => {
        value.remove();
        target.classList.remove("input-receiving");
        arrival();
        const cell = this.target(flight.name);
        if (!cell) return;
        const landing = cell.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.12)", offset: 0.4 },
            { transform: "scale(1)" },
          ],
          { duration: 240, easing: "cubic-bezier(0.16,1,0.3,1)" },
        );
        this.animation = landing;
        await landing.finished;
      })
      .catch(() => {})
      .finally(() => {
        value.remove();
        target.classList.remove("input-receiving");
        if (this.settled === settled) this.animation = null;
      });
    this.settled = settled;
  }
  close() {
    this.animation?.cancel();
    this.flight = null;
    this.request = null;
    if (this.dialog.open) this.dialog.close();
    document
      .querySelectorAll(".input-target")
      .forEach((el) => el.classList.remove("input-target"));
  }
}
