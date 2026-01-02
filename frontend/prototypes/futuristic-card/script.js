(function () {
  const card = document.querySelector(".card");
  const media = document.getElementById("media");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!card || prefersReduced) return;

  function onMove(e) {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    const rx = (y * 6).toFixed(2);
    const ry = (x * -8).toFixed(2);
    card.style.setProperty("--rx", rx + "deg");
    card.style.setProperty("--ry", ry + "deg");
    card.setAttribute("data-tilt", "true");
    media.style.transform = `translate3d(${x * 6}px,${y * 6}px,0) scale(1.01)`;
  }

  function onLeave() {
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    card.removeAttribute("data-tilt");
    media.style.transform = "";
  }

  card.addEventListener("mousemove", onMove);
  card.addEventListener("mouseleave", onLeave);
})();
