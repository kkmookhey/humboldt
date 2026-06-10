export function validateModule(m) {
  const req = ["id", "cloud", "voice", "model", "title", "intro", "recap", "sections"];
  for (const k of req) if (!(k in m)) throw new Error(`module missing '${k}'`);
  if (!m.title || !m.title.title) throw new Error("title.title required");
  if (!Array.isArray(m.sections) || m.sections.length === 0)
    throw new Error("sections must be a non-empty array");
  for (const s of m.sections) {
    for (const k of ["id", "section", "url", "kicker", "cardTitle", "bullets", "narration"])
      if (!(k in s)) throw new Error(`section '${s.id || "?"}' missing '${k}'`);
    if (s.drill)
      for (const k of ["id", "section", "kicker", "cardTitle", "bullets", "narration"])
        if (!(k in s.drill)) throw new Error(`drill in '${s.id}' missing '${k}'`);
  }
  if (!m.recap || !m.recap.card || !m.recap.narration) throw new Error("recap needs card + narration");
  return true;
}

export function segmentsOf(m) {
  const segs = [{ id: "intro", text: m.intro }];
  for (const s of m.sections) {
    segs.push({ id: s.id, text: s.narration });
    if (s.drill) segs.push({ id: s.drill.id, text: s.drill.narration });
  }
  segs.push({ id: "recap", text: m.recap.narration });
  return segs;
}
