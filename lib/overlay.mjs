import { THEME } from "./config.mjs";

export async function paintOverlay(page, data) {
  const paint = page.evaluate(({ d, mono }) => {
    const ID = "ccs-coach";
    document.getElementById(ID)?.remove();
    document.getElementById(ID + "-ribbon")?.remove();

    const ribbon = document.createElement("div");
    ribbon.id = ID + "-ribbon";
    Object.assign(ribbon.style, {
      position: "fixed", top: "0", left: "0", right: "0", height: "52px", display: "flex",
      alignItems: "center", justifyContent: "space-between", padding: "0 28px",
      background: "rgba(6,8,13,0.92)", borderBottom: "2px solid #58a6ff", color: "#e6edf3",
      fontFamily: mono, fontSize: "20px", letterSpacing: "1px", zIndex: "2147483647", pointerEvents: "none",
    });
    const left = document.createElement("span");
    const brand = document.createElement("b"); brand.style.color = "#58a6ff"; brand.textContent = d.brand;
    left.appendChild(brand); left.appendChild(document.createTextNode("   ·   " + d.subtitle));
    const right = document.createElement("span"); right.style.color = "#9aa7b6";
    right.textContent = `${d.section}   ${d.idx}/${d.total}`;
    ribbon.appendChild(left); ribbon.appendChild(right);
    document.body.appendChild(ribbon);

    const card = document.createElement("div");
    card.id = ID;
    Object.assign(card.style, {
      position: "fixed", left: "48px", bottom: "48px", width: "880px", maxWidth: "60vw",
      padding: "26px 30px", background: "rgba(13,17,23,0.95)", border: "1px solid #1f2733",
      borderLeft: "5px solid #58a6ff", borderRadius: "16px", boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
      color: "#e6edf3", fontFamily: mono, zIndex: "2147483647", opacity: "0",
      transform: "translateY(14px)", transition: "opacity .5s ease, transform .5s ease", pointerEvents: "none",
    });
    const kicker = document.createElement("div");
    kicker.textContent = d.kicker.toUpperCase();
    Object.assign(kicker.style, { color: "#bc8cff", fontSize: "16px", letterSpacing: "3px", marginBottom: "6px" });
    const title = document.createElement("div");
    title.textContent = d.title;
    Object.assign(title.style, { color: "#fff", fontSize: "34px", fontWeight: "800", lineHeight: "1.2", marginBottom: "16px" });
    const ul = document.createElement("ul");
    Object.assign(ul.style, { margin: "0", padding: "0", listStyle: "none" });
    d.bullets.forEach((b) => {
      const li = document.createElement("li");
      Object.assign(li.style, { position: "relative", paddingLeft: "26px", marginBottom: "12px", fontSize: "23px", lineHeight: "1.45", color: "#c9d1d9" });
      const dot = document.createElement("span"); dot.textContent = "▸";
      Object.assign(dot.style, { position: "absolute", left: "0", color: "#56d364" });
      li.appendChild(dot); li.appendChild(document.createTextNode(" " + b));
      ul.appendChild(li);
    });
    card.appendChild(kicker); card.appendChild(title); card.appendChild(ul);
    document.body.appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; card.style.transform = "translateY(0)"; });
  }, { d: data, mono: THEME.mono }).catch(() => {});
  // Never let a stuck renderer hang the recording: cap the paint at 10s.
  await Promise.race([paint, page.waitForTimeout(10000)]);
}

export async function paintFullCard(page, { kicker, title, lines, accent = "#58a6ff", badge, note }) {
  await page.goto("about:blank").catch(() => {});
  const paint = page.evaluate(({ d, mono }) => {
    Object.assign(document.body.style, {
      margin: "0", height: "100vh", display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center",
      background: "radial-gradient(1000px 650px at 50% 35%, #101a2b 0%, #06080d 70%)",
      fontFamily: mono, color: "#e6edf3",
    });
    if (d.badge) {
      const b = document.createElement("div"); b.textContent = d.badge.toUpperCase();
      Object.assign(b.style, {
        color: d.accent, border: `1px solid ${d.accent}`, borderRadius: "999px",
        padding: "8px 22px", fontSize: "20px", letterSpacing: "4px", marginBottom: "28px",
      });
      document.body.appendChild(b);
    }
    const k = document.createElement("div"); k.textContent = d.kicker.toUpperCase();
    Object.assign(k.style, { color: d.accent, letterSpacing: "8px", fontSize: "24px" });
    const t = document.createElement("div"); t.textContent = d.title;
    Object.assign(t.style, { fontSize: "72px", fontWeight: "800", margin: "16px 0 28px", textAlign: "center" });
    document.body.appendChild(k); document.body.appendChild(t);
    (d.lines || []).forEach((line) => {
      const el = document.createElement("div"); el.textContent = line;
      Object.assign(el.style, { fontSize: "30px", color: "#c9d1d9", margin: "6px 0", textAlign: "center" });
      document.body.appendChild(el);
    });
    if (d.note) {
      const n = document.createElement("div"); n.textContent = d.note;
      Object.assign(n.style, {
        marginTop: "34px", maxWidth: "1100px", padding: "18px 26px", textAlign: "center",
        fontSize: "26px", lineHeight: "1.4", color: "#e6edf3",
        background: "rgba(240,136,62,0.12)", border: "1px solid rgba(240,136,62,0.5)",
        borderRadius: "14px",
      });
      document.body.appendChild(n);
    }
  }, { d: { kicker, title, lines, accent, badge, note }, mono: THEME.mono }).catch(() => {});
  // Same guard as paintOverlay: a throttled renderer must not hang the recording.
  await Promise.race([paint, page.waitForTimeout(12000)]);
}
