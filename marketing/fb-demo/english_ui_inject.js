(() => {
  const map = [
    [/StyleARZ/gi, "Portal"],
    [/STYLE\s*ARZ/gi, "PORTAL"],
    [/stylearz\.com/gi, "portal.local"],
    [/your personal fashion statement/gi, "Organization · Inventory · POS"],
    [/shop · inventory · POS/gi, "Organization · Inventory · POS"],
    [/Thingkers(\s*Intelligence|\s*AI)?/gi, "Portal"],
  ];

  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      let v = n.nodeValue;
      if (!v || !v.trim()) continue;
      let next = v;
      for (const [re, to] of map) next = next.replace(re, to);
      if (next !== v) n.nodeValue = next;
    }
  };

  document.querySelectorAll(".logo-style").forEach((el) => {
    el.textContent = "PORTAL";
  });
  document.querySelectorAll(".logo-arz").forEach((el) => {
    el.textContent = "";
  });
  document.querySelectorAll(".logo-tag").forEach((el) => {
    el.textContent = "Organization · Inventory · POS";
  });
  document.querySelectorAll(".hero-lockup .logo-style").forEach((el) => {
    el.textContent = "PORTAL";
  });
  document.querySelectorAll(".hero-lockup .logo-arz").forEach((el) => {
    el.textContent = "";
  });
  walk(document.body);
  const wipe = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = wipe.nextNode())) {
    if (!node.nodeValue) continue;
    if (/style\s*arz|stylearz|thingkers/i.test(node.nodeValue)) {
      node.nodeValue = node.nodeValue
        .replace(/style\s*arz/gi, "Portal")
        .replace(/stylearz/gi, "portal")
        .replace(/thingkers(\s*intelligence|\s*ai)?/gi, "Portal");
    }
  }
  document.title = "Portal";
  return "en-neutral-ok";
})();
