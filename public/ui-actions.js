// One handler per control, with feedback and retry support for asynchronous actions.
const pendingUiActions = new WeakSet();
function bindAction(element, handler, eventType = "click") {
  if (!element) return;
  element[`on${eventType}`] = (event) => {
    if (pendingUiActions.has(element)) {
      event.preventDefault();
      return;
    }
    const reportError = (error) => showToast(error?.message || "Unable to complete this action. Please try again.");
    try {
      const control = event.submitter || element;
      const controls = control.dataset?.writeAction !== undefined
        ? Array.from(control.ownerDocument.querySelectorAll("[data-write-action]"))
        : [control];
      const previous = controls.map((button) => [button, button.disabled]);
      const result = handler(event);
      if (!result || typeof result.then !== "function") return result;
      pendingUiActions.add(element);
      controls.forEach((button) => { if ("disabled" in button) button.disabled = true; });
      control.setAttribute("aria-busy", "true");
      return Promise.resolve(result).catch(reportError).finally(() => {
        pendingUiActions.delete(element);
        control.removeAttribute("aria-busy");
        previous.forEach(([button, disabled]) => { if ("disabled" in button) button.disabled = disabled; });
      });
    } catch (error) {
      reportError(error);
    }
  };
}

function bindSubmit(form, handler) {
  bindAction(form, handler, "submit");
}
