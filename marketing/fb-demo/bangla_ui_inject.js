(() => {
  const map = [
    [/StyleARZ/gi, "Portal"],
    [/STYLE\s*ARZ/gi, "PORTAL"],
    [/stylearz\.com/gi, "portal.local"],
    [/Thingkers(\s*Intelligence|\s*AI)?/gi, "Portal"],
    [/your personal fashion statement/gi, "প্রতিষ্ঠান · ইনভেন্টরি · পিওএস"],
    [/shop · inventory · POS/gi, "প্রতিষ্ঠান · ইনভেন্টরি · পিওএস"],
    [/শপ · ইনভেন্টরি · পিওএস/g, "প্রতিষ্ঠান · ইনভেন্টরি · পিওএস"],
    [/আপনার দোকান/g, "আপনার প্রতিষ্ঠান"],
    [/দোকান/g, "প্রতিষ্ঠান"],
    [/দোকানের/g, "প্রতিষ্ঠানের"],
    [/দোকানে/g, "প্রতিষ্ঠানে"],
    [/\bShop\b/g, "পোর্টাল"],
    [/\bLookbook\b/g, "লুকবুক"],
    [/\bStudio\b/g, "স্টুডিও"],
    [/\bCommunity\b/g, "কমিউনিটি"],
    [/\bQuiz\b/g, "কুইজ"],
    [/\bPlanner\b/g, "প্ল্যানার"],
    [/\bWardrobe\b/g, "ওয়ারড্রোব"],
    [/\bAtelier\b/g, "অ্যাডমিন"],
    [/\bAdmin\b/g, "অ্যাডমিন"],
    [/\bOverview\b/g, "ওভারভিউ"],
    [/Open POS/g, "পিওএস খুলুন"],
    [/\bHome\b/g, "হোম"],
    [/\bInventory\b/g, "ইনভেন্টরি"],
    [/\bCategories\b/g, "ক্যাটাগরি"],
    [/\bBarcodes\b/g, "বারকোড"],
    [/POS sales/g, "পিওএস সেল"],
    [/\bProducts\b/g, "প্রোডাক্ট"],
    [/\bOrders\b/g, "অর্ডার"],
    [/\bUsers\b/g, "ইউজার"],
    [/\bModeration\b/g, "মডারেশন"],
    [/Prepare offline/g, "অফলাইন প্রস্তুত"],
    [/Prepare again/g, "আবার প্রস্তুত"],
    [/Morning checklist/g, "সকালের চেকলিস্ট"],
    [/Point of sale/g, "পয়েন্ট অফ সেল"],
    [/Remote scanner/g, "রিমোট স্ক্যানার"],
    [/Switch to Solo/g, "সোলো মোড"],
    [/Switch to Dual/g, "ডুয়াল মোড"],
    [/Exit POS/g, "পিওএস ছাড়ুন"],
    [/Start offline pair/g, "অফলাইন পেয়ার শুরু"],
    [/Use this phone only/g, "শুধু এই ফোন"],
    [/Complete sale/g, "বিক্রয় সম্পন্ন"],
    [/\bCart\b/g, "কার্ট"],
    [/\bPayment\b/g, "পেমেন্ট"],
    [/Payment method/g, "পেমেন্ট পদ্ধতি"],
    [/\bDiscount\b/g, "ছাড়"],
    [/\bSubtotal\b/g, "সাবটোটাল"],
    [/\bTotal\b/g, "মোট"],
    [/\bCash\b/g, "নগদ"],
    [/\bCard\b/g, "কার্ড"],
    [/\bOnline\b/g, "অনলাইন"],
    [/\bOffline\b/g, "অফলাইন"],
    [/Online code/g, "অনলাইন কোড"],
    [/Offline WebRTC/g, "অফলাইন ওয়েবআরটিসি"],
    [/Join a register/g, "রেজিস্টারে যোগ দিন"],
    [/Six-character code/g, "ছয় অক্ষরের কোড"],
    [/\bConnect\b/g, "কানেক্ট"],
    [/Checkout on this phone/g, "এই ফোনেই চেকআউট"],
    [/Scan offer QR/g, "অফার কিউআর স্ক্যান"],
    [/Scan answer QR/g, "আন্সার কিউআর স্ক্যান"],
    [/Copy answer/g, "আন্সার কপি"],
    [/Paste answer/g, "আন্সার পেস্ট"],
    [/Add item/g, "আইটেম যোগ"],
    [/Low stock/g, "কম স্টক"],
    [/Import shop products/g, "প্রোডাক্ট ইমপোর্ট"],
    [/Print labels/g, "লেবেল প্রিন্ট"],
    [/Search or scan a barcode/g, "সার্চ বা বারকোড স্ক্যান"],
    [/Search casuals/g, "সার্চ"],
    [/\bSaved\b/g, "সেভড"],
    [/\bBag\b/g, "ব্যাগ"],
    [/\bAlerts\b/g, "অ্যালার্ট"],
    [/Home collections/g, "হোম কালেকশন"],
    [/Save card/g, "কার্ড সেভ"],
    [/Replace image/g, "ছবি বদলান"],
    [/Shop casuals/g, "ক্যাটালগ দেখুন"],
    [/Take the style quiz/g, "কুইজ শুরু"],
    [/The edit/g, "কালেকশন"],
    [/All collections/g, "সব কালেকশন"],
    [/\bMen\b/g, "পুরুষ"],
    [/\bWomen\b/g, "নারী"],
    [/\bChildren\b/g, "শিশু"],
    [/\bUnisex\b/g, "ইউনিসেক্স"],
    [/\bFeatured\b/g, "ফিচার্ড"],
    [/\bRevenue\b/g, "রেভিনিউ"],
    [/\bClients\b/g, "ক্লায়েন্ট"],
    [/IN STOCK/g, "স্টকে আছে"],
    [/OUT OF STOCK/g, "স্টক নেই"],
    [/STYLES/g, "স্টাইল"],
    [/SIZE ROWS/g, "সাইজ সারি"],
    [/UNITS IN STOCK/g, "ইউনিট স্টক"],
    [/RETAIL VALUE/g, "রিটেইল মূল্য"],
    [/Pair a scanner/g, "স্ক্যানার পেয়ার"],
    [/Phone/g, "ফোন"],
    [/Not prepared on this device today yet\./g, "আজ এখনো এই ডিভাইসে প্রস্তুত হয়নি।"],
    [/Scan an item to begin this sale\./g, "বিক্রয় শুরু করতে আইটেম স্ক্যান করুন।"],
    [/Orders, inventory, clients, and community moderation\./g, "অর্ডার, ইনভেন্টরি, ক্লায়েন্ট ও মডারেশন।"],
    [/While the internet works, tap once on this device so POS still opens if the net drops later\. Then scan the QR on the phone and tap Prepare there too\./g, "নেট থাকতে একবার ট্যাপ করুন। পরে নেট গেলেও পিওএস খুলবে। ফোনেও একই কাজ করুন।"],
    [/While the internet works, tap once on this device so POS still opens if the net drops later\. Do the same on the counter\./g, "নেট থাকতে একবার ট্যাপ করুন। কাউন্টারেও একই কাজ করুন।"],
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

  // Neutral product branding during demo (provider name only appears at video end cards).
  document.querySelectorAll(".logo-style").forEach((el) => {
    el.textContent = "PORTAL";
  });
  document.querySelectorAll(".logo-arz").forEach((el) => {
    el.textContent = "";
  });
  document.querySelectorAll(".logo-tag").forEach((el) => {
    el.textContent = "প্রতিষ্ঠান · ইনভেন্টরি · পিওএস";
  });
  document.querySelectorAll(".hero-lockup .logo-style").forEach((el) => {
    el.textContent = "PORTAL";
  });
  document.querySelectorAll(".hero-lockup .logo-arz").forEach((el) => {
    el.textContent = "";
  });
  walk(document.body);
  // Remove any leftover StyleARZ / Thingkers text nodes from chrome
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
  return "bn-neutral-ok";
})();
