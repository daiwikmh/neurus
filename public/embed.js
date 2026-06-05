(function () {
  var script = document.currentScript;
  if (!script) return;
  var widget = script.getAttribute("data-widget");
  if (!widget) return;
  var base = new URL(script.src).origin;
  var open = false;

  var panel = document.createElement("iframe");
  panel.title = "Ask AI";
  panel.src = base + "/embed/" + encodeURIComponent(widget);
  panel.style.cssText =
    "position:fixed;bottom:88px;right:20px;width:380px;height:560px;max-width:calc(100vw - 40px);max-height:78vh;" +
    "border:none;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.45);z-index:2147483000;display:none;background:#0b0c0f";

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Ask AI");
  btn.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14152b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;" +
    "background:#9aa8f0;display:flex;align-items:center;justify-content:center;z-index:2147483001;box-shadow:0 6px 20px rgba(0,0,0,.35)";
  btn.onclick = function () {
    open = !open;
    panel.style.display = open ? "block" : "none";
  };

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(btn);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
