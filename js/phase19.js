/* Phase 19 · UI reboot — tiny DOM helper.
   The "reset / trash" button lives inside .vab-actions, which is a glass bar
   (backdrop-filter). A backdrop-filtered ancestor becomes the containing block
   for position:fixed descendants, so CSS alone can't float #vab-reset to the
   left tool rail. Re-parent it directly under #screen-vab once, on load. */
(function () {
  function relocateReset() {
    var btn = document.getElementById("vab-reset");
    var host = document.getElementById("screen-vab");
    if (btn && host && btn.parentElement !== host) host.appendChild(btn);
  }
  if (document.readyState !== "loading") relocateReset();
  else document.addEventListener("DOMContentLoaded", relocateReset);
})();
